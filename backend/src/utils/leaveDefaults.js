const DEFAULT_LEAVE_TYPES = [
  { code: 'PRIVILEGE_LEAVE', name: 'Privilege Leave / Earned Leave / Annual Leave', annualQuota: 12, isPaid: true, requiresApproval: true, allowCarryForward: true, enabled: true },
  { code: 'CASUAL_LEAVE', name: 'Casual Leave', annualQuota: 7, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'SICK_LEAVE', name: 'Sick Leave', annualQuota: 7, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'MATERNITY_LEAVE', name: 'Maternity Leave', annualQuota: 180, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'PATERNITY_LEAVE', name: 'Paternity Leave', annualQuota: 15, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'MARRIAGE_LEAVE', name: 'Marriage Leave', annualQuota: 5, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'SABBATICAL_LEAVE', name: 'Sabbatical Leave', annualQuota: 30, isPaid: false, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'BEREAVEMENT_LEAVE', name: 'Bereavement Leave', annualQuota: 5, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'HALF_DAY_LEAVE', name: 'Half-day Leave', annualQuota: 12, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'LOSS_OF_PAY', name: 'Loss of Pay Leave', annualQuota: 365, isPaid: false, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'COMP_OFF', name: 'Compensatory Off', annualQuota: 5, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
  { code: 'PUBLIC_HOLIDAY', name: 'Public Holiday', annualQuota: 0, isPaid: true, requiresApproval: false, allowCarryForward: false, enabled: false },
  { code: 'MENSTRUATION_LEAVE', name: 'Menstruation Leave', annualQuota: 12, isPaid: true, requiresApproval: true, allowCarryForward: false, enabled: true },
];

module.exports = {
  DEFAULT_LEAVE_TYPES,
};
