const express = require('express');
const router = express.Router();
const { body, validationResult, query, param } = require('express-validator');
const Employee = require('../models/Employee.model');
const User = require('../models/User.model');
const { authenticate, canManageEmployees, canViewReports } = require('../middleware/auth.middleware');
const { upload, saveBase64Image } = require('../middleware/upload.middleware');

// GET /api/employees - List all (Admin, Manager, HR, Supervisor)
router.get('/', authenticate, canViewReports, async (req, res, next) => {
  try {
    const { department, isActive, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .select('-faceDescriptors -aadharNo -panNo') // sensitive fields excluded by default
        .populate('reportingTo', 'name employeeCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Employee.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: employees,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// GET /api/employees/:id
router.get('/:id', authenticate, canViewReports, async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate('reportingTo', 'name employeeCode department')
      .populate('user', 'email role lastLogin');

    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    // Mask sensitive fields for non-admin/manager
    const data = employee.toObject();
    if (!['Admin', 'Manager'].includes(req.user.role)) {
      data.aadharNo = data.aadharNo ? `XXXX-XXXX-${data.aadharNo.slice(-4)}` : null;
      data.panNo = data.panNo ? `XXXXX${data.panNo.slice(-4)}` : null;
    }
    delete data.faceDescriptors; // never expose raw descriptors

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/employees - Create
router.post('/', authenticate, canManageEmployees, upload.single('photo'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('employeeCode').trim().notEmpty().withMessage('Employee code required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('mobile').matches(/^[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
  body('department').isIn(['IT Hardware', 'IT Software']).withMessage('Invalid department'),
  body('aadharNo').matches(/^\d{12}$/).withMessage('Aadhar must be 12 digits'),
  body('panNo').matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const {
      name, employeeCode, email, mobile, department, designation,
      aadharNo, panNo, address, reportingTo, workSchedule, password
    } = req.body;

    // Check duplicates
    const existing = await Employee.findOne({ $or: [{ employeeCode }, { email }, { aadharNo }, { panNo }] });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Employee with same code, email, Aadhar, or PAN already exists.' });
    }

    const employeeData = {
      name, employeeCode, email, mobile, department, designation,
      aadharNo, panNo,
      address: typeof address === 'string' ? JSON.parse(address) : address,
      reportingTo: reportingTo || null,
      workSchedule: workSchedule ? (typeof workSchedule === 'string' ? JSON.parse(workSchedule) : workSchedule) : undefined,
    };

    if (req.file) {
      employeeData.photo = req.file.path.replace(/\\/g, '/').split('uploads/')[1];
      employeeData.photo = `uploads/${employeeData.photo}`;
    }

    const employee = await Employee.create(employeeData);

    // Create user account for employee
    const userPassword = password || `Emp@${employeeCode}`;
    const user = await User.create({
      name,
      email,
      password: userPassword,
      role: 'Employee',
      employee: employee._id,
    });

    employee.user = user._id;
    await employee.save();

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      data: employee,
      defaultPassword: password ? undefined : userPassword,
    });
  } catch (err) { next(err); }
});

// PUT /api/employees/:id - Update
router.put('/:id', authenticate, canManageEmployees, upload.single('photo'), async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const allowedFields = ['name', 'mobile', 'department', 'designation', 'address', 'reportingTo', 'workSchedule', 'isActive'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.file) {
      updateData.photo = `uploads/employees/${req.file.filename}`;
    }

    const updated = await Employee.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    res.json({ success: true, message: 'Employee updated.', data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', authenticate, canManageEmployees, async (req, res, next) => {
  try {
    await Employee.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Employee deactivated.' });
  } catch (err) { next(err); }
});

// POST /api/employees/:id/face-enroll - Enroll face descriptors
router.post('/:id/face-enroll', authenticate, canManageEmployees, async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const { descriptors } = req.body;
    // descriptors: [{ angle: 'front', descriptor: [Float32Array as numbers], imageBase64: '...' }]

    if (!descriptors || !Array.isArray(descriptors) || descriptors.length === 0) {
      return res.status(400).json({ success: false, message: 'Face descriptors are required.' });
    }

    const enrolledDescriptors = [];
    for (const item of descriptors) {
      let imagePath = null;
      if (item.imageBase64) {
        imagePath = saveBase64Image(item.imageBase64, 'employees');
      }
      enrolledDescriptors.push({
        angle: item.angle || 'front',
        descriptor: item.descriptor,
        imagePath,
        capturedAt: new Date(),
      });
    }

    employee.faceDescriptors = enrolledDescriptors;
    employee.faceEnrolled = true;
    await employee.save();

    res.json({ success: true, message: `Face enrolled with ${enrolledDescriptors.length} angle(s).` });
  } catch (err) { next(err); }
});

// GET /api/employees/:id/face-descriptors - Used by client for recognition
router.get('/:id/face-descriptors', authenticate, async (req, res, next) => {
  try {
    // Only return own descriptors or admin/manager
    const isSelf = req.user.employee && req.user.employee._id.toString() === req.params.id;
    const isPrivileged = ['Admin', 'Manager'].includes(req.user.role);

    if (!isSelf && !isPrivileged) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const employee = await Employee.findById(req.params.id).select('faceDescriptors faceEnrolled');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    res.json({ success: true, data: { faceDescriptors: employee.faceDescriptors, faceEnrolled: employee.faceEnrolled } });
  } catch (err) { next(err); }
});

// GET /api/employees/all/face-descriptors - For recognition against all employees
router.get('/all/face-descriptors', authenticate, async (req, res, next) => {
  try {
    const employees = await Employee.find({ isActive: true, faceEnrolled: true })
      .select('_id name employeeCode faceDescriptors');
    res.json({ success: true, data: employees });
  } catch (err) { next(err); }
});

module.exports = router;