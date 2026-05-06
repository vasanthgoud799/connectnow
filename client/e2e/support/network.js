export const goOffline = async (page) => {
  await page.context().setOffline(true);
};

export const goOnline = async (page) => {
  await page.context().setOffline(false);
};
