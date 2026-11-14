export function validateExpense(data) {
  const errors = []
  if (!data.name?.trim()) errors.push('Name is required')
  if (!data.amount || data.amount <= 0) errors.push('Amount must be greater than 0')
  if (!data.category?.trim()) errors.push('Category is required')
  if (data.dueDate && isNaN(new Date(data.dueDate).getTime())) errors.push('Invalid date')
  if (data.installmentCurrent && data.installmentTotal && data.installmentCurrent > data.installmentTotal)
    errors.push('Current installment cannot exceed total')
  return { valid: errors.length === 0, errors }
}

export function validateLoan(data) {
  const errors = []
  if (!data.name?.trim()) errors.push('Name is required')
  if (!data.totalAmount || data.totalAmount <= 0) errors.push('Amount must be greater than 0')
  if (!data.isOneTime && (!data.monthlyInstallment || data.monthlyInstallment <= 0))
    errors.push('EMI must be greater than 0')
  if (data.totalMonths && data.totalMonths > 360) errors.push('Term cannot exceed 30 years')
  if (data.monthsPaid && data.totalMonths && data.monthsPaid > data.totalMonths)
    errors.push('Paid months exceed total months')
  return { valid: errors.length === 0, errors }
}

export function validateGoal(data) {
  const errors = []
  if (!data.name?.trim()) errors.push('Name is required')
  if (!data.targetAmount || data.targetAmount <= 0) errors.push('Target must be greater than 0')
  return { valid: errors.length === 0, errors }
}

export function validateBuyItem(data) {
  const errors = []
  if (!data.name?.trim()) errors.push('Name is required')
  return { valid: errors.length === 0, errors }
}
