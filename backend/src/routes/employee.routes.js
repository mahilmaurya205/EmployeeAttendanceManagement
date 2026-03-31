const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate, authorize, canManageEmployees, canViewReports } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const employeeController = require('../controllers/employee.controller');

// GET /api/employees - List all (Admin, Manager, HR, Supervisor)
router.get('/', authenticate, canViewReports, employeeController.listEmployees);

// Keep face-descriptor routes before /:id routes so "/all/face-descriptors" is not swallowed.
router.get('/all/face-descriptors', authenticate, employeeController.getAllFaceDescriptors);
router.get('/:id/face-descriptors', authenticate, employeeController.getFaceDescriptors);

// POST /api/employees - Create
router.post('/', authenticate, canManageEmployees, upload.single('photo'), [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('employeeCode').trim().notEmpty().withMessage('Employee code required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('mobile').matches(/^[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
  body('department').isIn(['IT Hardware', 'IT Software']).withMessage('Invalid department'),
  body('aadharNo').matches(/^\d{12}$/).withMessage('Aadhar must be 12 digits'),
  body('panNo').matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN format'),
], employeeController.createEmployee);

// PUT /api/employees/:id - Update
router.get('/:id', authenticate, canViewReports, employeeController.getEmployee);
router.put('/:id', authenticate, canManageEmployees, upload.single('photo'), employeeController.updateEmployee);
router.put('/:id/toggle-active', authenticate, canManageEmployees, employeeController.toggleEmployeeActive);

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', authenticate, canManageEmployees, employeeController.deleteEmployee);
router.delete('/:id/permanent', authenticate, authorize('Admin'), employeeController.deleteEmployeePermanent);

// POST /api/employees/:id/face-enroll - Enroll face descriptors
router.post('/:id/face-enroll', authenticate, canManageEmployees, employeeController.enrollFace);

module.exports = router;
