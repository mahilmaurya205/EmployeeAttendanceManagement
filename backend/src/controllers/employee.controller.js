const { validationResult } = require('express-validator');
const Employee = require('../models/Employee.model');
const User = require('../models/User.model');
const AttendanceLog = require('../models/AttendanceLog.model');
const AttendanceSummary = require('../models/AttendanceSummary.model');
const { saveBase64Image } = require('../middleware/upload.middleware');
const {
  ROLES,
  asId,
  getAdminOwnerId,
  getDistributorOwnerId,
  buildEmployeeScopeFilter,
} = require('../utils/access');

const safeJsonParse = (value, fallback = undefined) => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const buildPhotoPath = (file) => {
  if (!file?.path) return undefined;
  const normalized = file.path.replace(/\\/g, '/');
  const uploadIndex = normalized.lastIndexOf('uploads/');
  return uploadIndex >= 0 ? normalized.substring(uploadIndex) : normalized;
};

exports.listEmployees = async (req, res, next) => {
  try {
    const { department, isActive, page = 1, limit = 20, search } = req.query;
    const filter = { ...buildEmployeeScopeFilter(req.user) };

    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .select('-faceDescriptors -aadharNo -panNo')
        .populate('reportingTo', 'name employeeCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Employee.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: employees,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) })
      .populate('reportingTo', 'name employeeCode department')
      .populate('user', 'email role lastLogin isActive');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const data = employee.toObject();
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(req.user.role)) {
      data.aadharNo = data.aadharNo ? `XXXX-XXXX-${data.aadharNo.slice(-4)}` : null;
      data.panNo = data.panNo ? `XXXXX${data.panNo.slice(-4)}` : null;
    }

    delete data.faceDescriptors;

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      name,
      employeeCode,
      email,
      mobile,
      department,
      designation,
      basicSalary,
      aadharNo,
      panNo,
      address,
      reportingTo,
      workSchedule,
      password,
    } = req.body;

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(employeeCode).trim().toUpperCase();
    const normalizedPan = String(panNo).trim().toUpperCase();

    const [existingEmployee, existingUser] = await Promise.all([
      Employee.findOne({
        $or: [
          { employeeCode: normalizedCode },
          { email: normalizedEmail },
          { aadharNo: String(aadharNo).trim() },
          { panNo: normalizedPan },
        ],
      }),
      User.findOne({ email: normalizedEmail }),
    ]);

    if (existingEmployee || existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Employee or user with the same code, email, Aadhar, or PAN already exists.',
      });
    }

    const employeeData = {
      name: String(name).trim(),
      employeeCode: normalizedCode,
      email: normalizedEmail,
      mobile: String(mobile).trim(),
      department,
      designation,
      basicSalary: Number(basicSalary),
      aadharNo: String(aadharNo).trim(),
      panNo: normalizedPan,
      address: safeJsonParse(address, address),
      reportingTo: reportingTo || null,
      workSchedule: safeJsonParse(workSchedule, workSchedule),
      adminOwner: getAdminOwnerId(req.user),
      distributorOwner: getDistributorOwnerId(req.user),
    };

    const photoPath = buildPhotoPath(req.file);
    if (photoPath) employeeData.photo = photoPath;

    const employee = await Employee.create(employeeData);

    const userPassword = password || `Emp@${normalizedCode}`;
    const user = await User.create({
      name: employee.name,
      email: employee.email,
      password: userPassword,
      role: ROLES.EMPLOYEE,
      employee: employee._id,
      creator: req.user._id,
      adminOwner: getAdminOwnerId(req.user),
      distributorOwner: getDistributorOwnerId(req.user),
    });

    employee.user = user._id;
    await employee.save();

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      data: employee,
      defaultPassword: password ? undefined : userPassword,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const updateData = {};
    const directFields = ['name', 'email', 'mobile', 'department', 'designation', 'reportingTo'];

    directFields.forEach((field) => {
      if (req.body[field] !== undefined && req.body[field] !== '') {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.basicSalary !== undefined && req.body.basicSalary !== '') {
      const basicSalary = Number(req.body.basicSalary);
      if (!Number.isFinite(basicSalary) || basicSalary < 0) {
        return res.status(400).json({ success: false, message: 'Basic salary must be a valid non-negative amount.' });
      }
      updateData.basicSalary = basicSalary;
    }

    if (req.body.address !== undefined) {
      updateData.address = safeJsonParse(req.body.address, employee.address);
    }

    if (req.body.workSchedule !== undefined) {
      updateData.workSchedule = safeJsonParse(req.body.workSchedule, employee.workSchedule);
    }

    if (req.body.isActive !== undefined) {
      updateData.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }

    const photoPath = buildPhotoPath(req.file);
    if (photoPath) updateData.photo = photoPath;

    if (updateData.email) {
      updateData.email = String(updateData.email).trim().toLowerCase();
      const duplicateEmployee = await Employee.findOne({
        email: updateData.email,
        _id: { $ne: employee._id },
      });
      if (duplicateEmployee) {
        return res.status(409).json({ success: false, message: 'Email already in use by another employee.' });
      }
    }

    const updated = await Employee.findOneAndUpdate({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) }, updateData, {
      new: true,
      runValidators: true,
    });

    if (updated?.user) {
      const userUpdate = {};
      if (updateData.name) userUpdate.name = updateData.name;
      if (updateData.email) userUpdate.email = updateData.email;
      if (Object.prototype.hasOwnProperty.call(updateData, 'isActive')) userUpdate.isActive = updateData.isActive;

      if (Object.keys(userUpdate).length > 0) {
        const duplicateUser = userUpdate.email
          ? await User.findOne({ email: userUpdate.email, _id: { $ne: updated.user } })
          : null;

        if (duplicateUser) {
          return res.status(409).json({ success: false, message: 'Email already in use by another user.' });
        }

        await User.findByIdAndUpdate(updated.user, userUpdate, { runValidators: true });
      }
    }

    res.json({ success: true, message: 'Employee updated.', data: updated });
  } catch (err) {
    next(err);
  }
};

exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.id, ...buildEmployeeScopeFilter(req.user) },
      { isActive: false },
      { new: true }
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (employee.user) {
      await User.findByIdAndUpdate(employee.user, { isActive: false });
    }

    res.json({ success: true, message: 'Employee deactivated.', data: employee });
  } catch (err) {
    next(err);
  }
};

exports.toggleEmployeeActive = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    employee.isActive = !employee.isActive;
    await employee.save();

    if (employee.user) {
      await User.findByIdAndUpdate(employee.user, { isActive: employee.isActive });
    }

    res.json({
      success: true,
      message: `Employee ${employee.isActive ? 'activated' : 'deactivated'}.`,
      data: employee,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteEmployeePermanent = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    await Promise.all([
      AttendanceLog.deleteMany({ employee: employee._id }),
      AttendanceSummary.deleteMany({ employee: employee._id }),
      employee.user ? User.findByIdAndDelete(employee.user) : Promise.resolve(),
      Employee.findByIdAndDelete(employee._id),
    ]);

    res.json({
      success: true,
      message: 'Employee and related attendance data deleted permanently.',
      data: { employeeId: req.params.id },
    });
  } catch (err) {
    next(err);
  }
};

exports.enrollFace = async (req, res, next) => {
  try {
    const employee = await Employee.findOne({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const { descriptors } = req.body;
    if (!Array.isArray(descriptors) || descriptors.length === 0) {
      return res.status(400).json({ success: false, message: 'Face descriptors are required.' });
    }

    const enrolledDescriptors = descriptors.map((item) => ({
      angle: item.angle || 'front',
      descriptor: Array.isArray(item.descriptor) ? item.descriptor : [],
      imagePath: item.imageBase64 ? saveBase64Image(item.imageBase64, 'employees') : null,
      capturedAt: new Date(),
    }));

    employee.faceDescriptors = enrolledDescriptors;
    employee.faceEnrolled = true;
    await employee.save();

    res.json({
      success: true,
      message: `Face enrolled with ${enrolledDescriptors.length} angle(s).`,
      data: { faceEnrolled: true, count: enrolledDescriptors.length },
    });
  } catch (err) {
    next(err);
  }
};

exports.getFaceDescriptors = async (req, res, next) => {
  try {
    const selfEmployeeId = req.user.employee?._id?.toString() || req.user.employee?.toString();
    const isSelf = selfEmployeeId === req.params.id;
    const isPrivileged = [ROLES.ADMIN, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR].includes(req.user.role);

    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const employee = await Employee.findOne({ _id: req.params.id, ...buildEmployeeScopeFilter(req.user) }).select('faceDescriptors faceEnrolled');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    res.json({
      success: true,
      data: {
        faceDescriptors: employee.faceDescriptors,
        faceEnrolled: employee.faceEnrolled,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getAllFaceDescriptors = async (req, res, next) => {
  try {
    const employees = await Employee.find({ ...buildEmployeeScopeFilter(req.user), isActive: true, faceEnrolled: true })
      .select('_id name employeeCode faceDescriptors');

    res.json({ success: true, data: employees });
  } catch (err) {
    next(err);
  }
};
