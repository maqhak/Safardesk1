export interface CustomerDoc {
  id: string;
  fullName: string;
  passportNumber: string; // Unique
  nationality: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth?: string;
  age?: number;
  cnic?: string;
  mobile: string;
  email?: string;
  city: string;
  address?: string;
  channel: 'direct' | 'agent';
  agentId?: string; // Only if channel is 'agent'
  notes?: string;
  createdFrom: 'import' | 'manual' | 'voucher';
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}
