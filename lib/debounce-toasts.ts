export function createOtherUserAddToastDebouncer(
  showToast: (message: string) => void,
  getUserName: (userId: string) => string | null,
  formatSingle: (itemName: string, userName: string | null) => string,
  formatBulk: (count: number, userName: string | null) => string,
  delayMs = 1500,
) {
  let pending: { createdBy: string; names: string[] } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (!pending) return;
    const userName = getUserName(pending.createdBy);
    if (pending.names.length === 1) {
      showToast(formatSingle(pending.names[0], userName));
    } else {
      showToast(formatBulk(pending.names.length, userName));
    }
    pending = null;
    timer = null;
  };

  return (createdBy: string, itemName: string) => {
    if (pending && pending.createdBy !== createdBy) {
      if (timer) clearTimeout(timer);
      flush();
    }

    if (!pending) {
      pending = { createdBy, names: [itemName] };
    } else {
      pending.names.push(itemName);
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };
}
