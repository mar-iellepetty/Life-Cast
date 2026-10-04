export const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export const compact = (n: number) => {
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e6) s = (abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  else if (abs >= 1e3) s = Math.round(abs / 1e3) + 'K';
  else s = String(Math.round(abs));
  return (n < 0 ? '-$' : '$') + s;
};
