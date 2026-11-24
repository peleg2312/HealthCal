/**
 * The widest a column of long reading text is drawn (rubric D9-07: 45 to 75 characters a line at
 * 390 and at the 560 px content cap). Body text (15 px) at 460 px holds about 70 characters; a
 * caption (12 to 13 px) needs the narrower 380 (at 400 About's longest source line ran to 76). At
 * phone widths the column is narrower than both, so nothing changes there.
 */
export const READING_MAX = 460;
export const CAPTION_READING_MAX = 380;
