import i18next from "i18next";

const resources = {
  en: {
    translation: {
      entity: {
        session: "session",
        user: "user",
        playlist: "playlist",
      },
      error: {
        not_found: '$t(entity.{{entity}}) "{{context}}" can not be found',
        unauthorized: "You must be signed in to do this action",
        forbidden:
          'You are not allowed to access the session $t(entity.{{entity}}) "{{context}}"',
        tracks_required: "You must provide songs",
        username_taken: "The username {{username}} is not available",
        invalid_argument: '"{{arg}}" is invalid: {{message}}',
        session_ended: "Session has already been ended",
        not_collaborator: "You must be a collaborator to do this action",
        must_end_other_sessions:
          "You must end other sessions before starting a new one",
      },
    },
  },
  vi: {
    translation: {
      entity: {
        session: "phiên",
        user: "người dùng",
        playlist: "playlist",
      },
      error: {
        not_found: 'không thể tìm thấy $t(entity.{{entity}}) "{{context}}"',
        unauthorized: "Bạn phải đăng nhập để thực hiện hành động này",
        forbidden:
          'Bạn không được phép truy cập $t(entity.{{entity}}) "{{context}}"',
        tracks_required: "Bạn phải cung cấp bài hát",
        username_taken: "Username {{username}} không có sẵn",
        invalid_argument: '"{{arg}}" không hợp lệ: {{message}}',
        session_ended: "Phiên {{ session.text }} đã kết thúc",
        not_collaborator:
          "Bạn phải là một cộng tác viên để thực hiện hành động này",
        must_end_other_sessions:
          "Bạn phải kết thúc các phiên khác trước khi bắt đầu phiên mới",
      },
    },
  },
};

export type ErrorTKey = `error.${keyof typeof resources.en.translation.error}`;

export const t = await i18next.init({
  resources,
  fallbackLng: "en",
});
