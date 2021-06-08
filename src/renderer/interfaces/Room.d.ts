export default interface Room {
  roomId: Number;
  roomName: string;
  avatar: string;
  index: number;
  unreadCount: number;
  priority: number;
  utime: number;
  users:
    | [{ _id: 1; username: "1" }, { _id: 2; username: "2" }]
    | [
        { _id: 1; username: "1" },
        { _id: 2; username: "2" },
        { _id: 3; username: "3" }
      ];
  at: boolean | null;
  lastMessage: {
    content: string;
    timestamp: string;
    username?: string;
  };
  autoDownload?: boolean;
  downloadPath?: string;
}
export interface RoomIniDB {
  roomId: Number;
  roomName: string;
  avatar: string;
  index: number;
  unreadCount: number;
  priority: number;
  utime: number;
  users: string;
  at: boolean;
  lastMessage: {
    content: string;
    timestamp: string;
    username?: string;
  };
  autoDownload?: boolean;
  downloadPath?: string;
}
