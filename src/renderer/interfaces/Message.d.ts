export default interface Message {
  _id: string;
  senderId: number;
  username: string;
  content: string;
  timestamp: string;
  date: string;
  role?: string;
  time?: number;
  file?: {
    type: string;
    url: string;
    size?: number;
    name?: string;
  };
}
interface MessageInidb {
  _id: string;
  roomId: number;
  senderId: number;
  username: string;
  content: string;
  timestamp: string;
  date: string;
  role?: string;
  time?: number;
  file?: {
    type: string;
    url: string;
    size?: number;
    name?: string;
  };
}
