// Third Saturday/Sunday weekend in October; expires at Monday 00:00 Asia/Shanghai.
function deletionExpiry(deletedAt) {
  const instant = new Date(deletedAt);
  const year = new Date(instant.getTime() + 8 * 3600000).getUTCFullYear();
  function cutoff(y) {
    const firstDay = new Date(Date.UTC(y, 9, 1)).getUTCDay();
    const thirdSaturday = 1 + (6 - firstDay + 7) % 7 + 14;
    return new Date(Date.UTC(y, 9, thirdSaturday + 2, -8));
  }
  const current = cutoff(year);
  return instant < current ? current : cutoff(year + 1);
}
module.exports = { deletionExpiry };
