export function formatItemsAddedBody(
  itemNames: string[],
  listName: string,
  isWishlist: boolean,
): string {
  const count = itemNames.length;
  if (count === 0) return "";

  if (count === 1) {
    const name = itemNames[0];
    return isWishlist
      ? `"${name}" added to wishlist ${listName}`
      : `"${name}" added to ${listName}`;
  }

  if (count === 2) {
    const [first, second] = itemNames;
    return isWishlist
      ? `"${first}" and "${second}" added to wishlist ${listName}`
      : `"${first}" and "${second}" added to ${listName}`;
  }

  return isWishlist
    ? `${count} items added to wishlist ${listName}`
    : `${count} items added to ${listName}`;
}
