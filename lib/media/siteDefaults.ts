/** Public policy defaults; account settings and usage stay on the server. */
export const siteDefaults = {web:25*1024*1024, image:20*1024*1024, original:512*1024*1024, audio:512*1024*1024, voicenote:10_000_000} as const;

export const audioDurationDefaults = {voicenote:600} as const;
