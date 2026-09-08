import { createFixtureProvider } from "./fixture-provider";
createFixtureProvider().listen(3199, "127.0.0.1", () =>
  console.log("Test-only protocol fixture listening on 3199"),
);
