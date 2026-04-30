import { DeliveryManFormData } from "./types";

export const steps = [
  "Document OCR",
  "Personal Info",
  "Identity",
  "Family",
  "References",
  "Documents",
  "Assignment",
  "Review",
];

export const warehouseOptions = [
  "Dhaka Main Warehouse",
  "Chattogram Warehouse",
  "Sylhet Warehouse",
  "Khulna Warehouse",
];

export const initialFormData: DeliveryManFormData = {
  fullName: "",
  mobileNumber: "",
  alternateMobileNumber: "",
  email: "",
  password: "",
  dateOfBirth: "",
  gender: "",
  bloodGroup: "",
  maritalStatus: "",
  profilePhoto: null,
  presentAddress: "",
  permanentAddress: "",
  emergencyContactName: "",
  emergencyContactNumber: "",
  emergencyContactRelation: "",

  identityType: "NID",
  identityNumber: "",
  identityFrontFile: null,
  identityBackFile: null,
  passportExpiryDate: "",

  fatherName: "",
  fatherMobileNumber: "",
  fatherIdentityType: "NID",
  fatherIdentityNumber: "",
  fatherIdentityFrontFile: null,
  fatherIdentityBackFile: null,

  motherName: "",
  motherMobileNumber: "",
  motherIdentityType: "NID",
  motherIdentityNumber: "",
  motherIdentityFrontFile: null,
  motherIdentityBackFile: null,

  references: [
    {
      name: "",
      phone: "",
      relation: "",
      address: "",
      occupation: "",
      identityType: "NID",
      identityNumber: "",
      identityFrontFile: null,
      identityBackFile: null,
    },
    {
      name: "",
      phone: "",
      relation: "",
      address: "",
      occupation: "",
      identityType: "NID",
      identityNumber: "",
      identityFrontFile: null,
      identityBackFile: null,
    },
  ],

  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  chequeNumber: "",
  bankChequeFile: null,

  bondAmount: "",
  bondSignedDate: "",
  bondExpiryDate: "",
  bondDocumentFile: null,

  contractSignedDate: "",
  contractStartDate: "",
  contractEndDate: "",
  contractStatus: "",
  contractPaperFile: null,

  warehouse: "",
  employeeCode: "",
  joiningDate: "",
  employmentType: "",
  deliveryZone: "",
  assignedBy: "",
  notes: "",

  declarationAccurate: false,
  declarationVerification: false,
  declarationPolicy: false,
  signatureFile: null,
  declarationDate: "",
};
