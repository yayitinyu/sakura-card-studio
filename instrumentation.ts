export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installRedaction, registerSecret } =
      await import("./lib/server/logging");
    if (process.env.APP_SECRET) registerSecret(process.env.APP_SECRET);
    installRedaction();
  }
}
