export interface ScheduledNote {
  id: string;
  content: string;
  scheduledTime: string; // ISO 8601
  createdAt: string; // ISO 8601
  status: "pending" | "posting" | "delivered" | "failed";
  error?: string;
  deliveredAt?: string;
}

export interface ProseMirrorDoc {
  type: "doc";
  attrs: { schemaVersion: string };
  content: ProseMirrorParagraph[];
}

export interface ProseMirrorParagraph {
  type: "paragraph";
  content?: ProseMirrorText[];
}

export interface ProseMirrorText {
  type: "text";
  text: string;
}
