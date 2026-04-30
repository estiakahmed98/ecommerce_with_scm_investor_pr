export type IdentityType = "NID" | "PASSPORT";
export type Gender = "MALE" | "FEMALE" | "OTHER" | "";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACTUAL" | "";

export interface ParsedDocumentData {
  documentType?: "NID" | "PASSPORT" | "UNKNOWN";
  fullName?: string;
  identityNumber?: string;
  dateOfBirth?: string;
  passportExpiryDate?: string;
  rawText?: string;
}

export interface ReferencePerson {
  name: string;
  phone: string;
  relation: string;
  address: string;
  occupation: string;
  identityType: IdentityType;
  identityNumber: string;
  identityFrontFile: File | null;
  identityBackFile: File | null;
}

export interface DeliveryManFormData {
  fullName: string;
  mobileNumber: string;
  alternateMobileNumber: string;
  email: string;
  password: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup: string;
  maritalStatus: string;
  profilePhoto: File | null;
  presentAddress: string;
  permanentAddress: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  emergencyContactRelation: string;

  identityType: IdentityType;
  identityNumber: string;
  identityFrontFile: File | null;
  identityBackFile: File | null;
  passportExpiryDate: string;

  fatherName: string;
  fatherMobileNumber: string;
  fatherIdentityType: IdentityType;
  fatherIdentityNumber: string;
  fatherIdentityFrontFile: File | null;
  fatherIdentityBackFile: File | null;

  motherName: string;
  motherMobileNumber: string;
  motherIdentityType: IdentityType;
  motherIdentityNumber: string;
  motherIdentityFrontFile: File | null;
  motherIdentityBackFile: File | null;

  references: ReferencePerson[];

  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  chequeNumber: string;
  bankChequeFile: File | null;

  bondAmount: string;
  bondSignedDate: string;
  bondExpiryDate: string;
  bondDocumentFile: File | null;

  contractSignedDate: string;
  contractStartDate: string;
  contractEndDate: string;
  contractStatus: string;
  contractPaperFile: File | null;

  warehouse: string;
  employeeCode: string;
  joiningDate: string;
  employmentType: EmploymentType;
  deliveryZone: string;
  assignedBy: string;
  notes: string;

  declarationAccurate: boolean;
  declarationVerification: boolean;
  declarationPolicy: boolean;
  signatureFile: File | null;
  declarationDate: string;
}
