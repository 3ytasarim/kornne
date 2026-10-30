import { cleanupE2eWrites } from "./cleanup";
import { deleteTestAdmins, deleteTestQuotes } from "./test-admin";

export default async function globalTeardown() {
  // revert test-made changes while the test users still exist (they identify what to revert)
  await cleanupE2eWrites();
  await deleteTestQuotes();
  await deleteTestAdmins();
}
