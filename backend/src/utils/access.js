const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  DISTRIBUTOR: 'Distributor',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  HR: 'HR',
  SUPERVISOR: 'Supervisor',
  EMPLOYEE: 'Employee',
};

const ALL_ROLES = Object.values(ROLES);
const ADMIN_STAFF_ROLES = [ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR];
const REPORT_VIEW_ROLES = [ROLES.SUPER_ADMIN, ROLES.DISTRIBUTOR, ROLES.ADMIN, ROLES.MANAGER, ROLES.HR, ROLES.SUPERVISOR];
const EMPLOYEE_MANAGEMENT_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
const ATTENDANCE_MODIFY_ROLES = [ROLES.ADMIN, ROLES.MANAGER];
const USER_MANAGEMENT_ROLES = [ROLES.SUPER_ADMIN, ROLES.DISTRIBUTOR, ROLES.ADMIN];

const asId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id ? String(value._id) : String(value);
};

const normalizeRole = (role) => {
  if (!role) return role;
  const lowered = String(role).trim().toLowerCase();
  return ALL_ROLES.find((item) => item.toLowerCase() === lowered) || role;
};

const getAdminOwnerId = (user) => {
  if (!user) return null;
  if (user.role === ROLES.ADMIN) return asId(user._id);
  return asId(user.adminOwner);
};

const getDistributorOwnerId = (user) => {
  if (!user) return null;
  if (user.role === ROLES.DISTRIBUTOR) return asId(user._id);
  return asId(user.distributorOwner);
};

const buildEmployeeScopeFilter = (user) => {
  if (!user) return { _id: null };

  if (user.role === ROLES.SUPER_ADMIN) return {};
  if (user.role === ROLES.DISTRIBUTOR) return { distributorOwner: asId(user._id) };

  const adminOwnerId = getAdminOwnerId(user);
  if (adminOwnerId) return { adminOwner: adminOwnerId };

  if (user.role === ROLES.EMPLOYEE && user.employee) {
    return { _id: asId(user.employee) };
  }

  return { _id: null };
};

const buildUserScopeFilter = (user) => {
  if (!user) return { _id: null };

  if (user.role === ROLES.SUPER_ADMIN) return {};

  if (user.role === ROLES.DISTRIBUTOR) {
    return {
      $or: [
        { _id: asId(user._id) },
        { distributorOwner: asId(user._id) },
      ],
    };
  }

  const adminOwnerId = getAdminOwnerId(user);
  if (adminOwnerId) {
    return {
      $or: [
        { _id: asId(user._id) },
        { adminOwner: adminOwnerId },
      ],
    };
  }

  if (user.role === ROLES.EMPLOYEE) {
    return { _id: asId(user._id) };
  }

  return { _id: null };
};

module.exports = {
  ROLES,
  ALL_ROLES,
  ADMIN_STAFF_ROLES,
  REPORT_VIEW_ROLES,
  EMPLOYEE_MANAGEMENT_ROLES,
  ATTENDANCE_MODIFY_ROLES,
  USER_MANAGEMENT_ROLES,
  asId,
  normalizeRole,
  getAdminOwnerId,
  getDistributorOwnerId,
  buildEmployeeScopeFilter,
  buildUserScopeFilter,
};
