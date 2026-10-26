export interface ClassroomInfo {
  roomNumber: string | null;
  floor: number | null;
  floorLabel: string | null;
  building: string | null;
  campus: string | null;
  mappingStatus: string | null;
}

export interface GroupInfo {
  sectionCode: string;
  groupName: string;
  hasInvite: boolean;
  status: string;
  created: boolean;
  requireApproval: boolean;
}

/** What the invite-send API returns. */
export interface InviteSendResult {
  status: "sent" | "group_not_ready" | "not_found" | "ambiguous" | "invalid" | "rate_limited" | "error";
  maskedNumber?: string;
  groupName?: string;
  sectionCode?: string;
  messagePreview?: string;
  deliveredAt?: string;
  method?: string;
  error?: string;
  hint?: string;
}

export interface ResultData {
  name: string;
  mobile: string;
  mobileDisplay: string;
  program: string;
  section: string;
  rollNumber: string;
  classroom: ClassroomInfo | null;
  classroomUnavailable: boolean;
  group: GroupInfo | null;
}

export interface TimetableSlot {
  id: number;
  day: number;
  period: number;
  startTime: string | null;
  endTime: string | null;
  subject: string | null;
  subjectCode: string | null;
  facultyId: number | null;
  room: string | null;
  group: string | null;
  kind: string;
}