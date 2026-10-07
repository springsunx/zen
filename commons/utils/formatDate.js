import { getLang, t } from "../i18n/index.js";

export default function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) {
    const currentYear = now.getFullYear();
    const dateYear = date.getFullYear();
    const locale = getLang();
    if (currentYear === dateYear) {
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    }
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } else if (days > 7) {
    return t("date.relative.weeksAgo", { count: Math.floor(days / 7) });
  } else if (days > 1) {
    return t("date.relative.daysAgo", { count: days });
  } else if (days === 1) {
    return t("date.relative.daysAgo", { count: 1 });
  } else if (hours > 0) {
    return t("date.relative.hoursAgo", { count: hours });
  } else if (minutes > 0) {
    return t("date.relative.minutesAgo", { count: minutes });
  } else {
    return t("date.relative.now");
  }
}
