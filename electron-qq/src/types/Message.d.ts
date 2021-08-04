import MessageMirai from "./MessageMirai";

interface MessageFile {
  type: string;
  url: string;
  size?: number;
  name?: string;
  fid?: string;
}

export default interface Message {
  mirai?: MessageMirai;
  reveal?: boolean;
  code?: string;
  at?: boolean | "all";
  _id: string | number;
  senderId?: number;
  username: string;
  content: string;
  timestamp?: string;
  date?: string;
  role?: string;
  time?: number;
  deleted?: boolean | Date | number;
  file?: MessageFile;
  replyMessage?: Message;
  system?: boolean;
}

interface MessageInIDB extends Message {
  roomId: number;
}
