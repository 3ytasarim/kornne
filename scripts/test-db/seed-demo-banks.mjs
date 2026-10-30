// LOCAL e2e copy ONLY: creates the six client banks with obviously-dummy (but checksum-valid) IBANs so the bank
// transfer screens can be designed and tested. Real IBANs are entered by the client in Admin › Banka hesapları.
//   node scripts/test-db/seed-demo-banks.mjs
import pg from "pg";
import { randomBytes } from "node:crypto";
import { assertLocalTestUrl, testDatabaseUrl } from "../../tests/test-db-url.mjs";

const url = testDatabaseUrl("e2e");
assertLocalTestUrl(url);
const BANKS = [["Vakıf Bankası", "00015"], ["Ziraat Bankası", "00010"], ["Türkiye İş Bankası", "00064"], ["ING Bank", "00099"], ["Akbank", "00046"], ["Garanti BBVA", "00062"]];
const mod97 = (s) => [...s].reduce((r, d) => (r * 10 + Number(d)) % 97, 0);
const iban = (bank) => {
  const bban = `${bank}0${"0".repeat(15)}1`; // 5 bank + 1 reserve + 16 account "0000000000000001"
  const check = String(98 - mod97(`${bban}2927` + "00")).padStart(2, "0"); // T=29 R=27
  return `TR${check}${bban}`;
};
const c = new pg.Client({ connectionString: url });
await c.connect();
const { rows } = await c.query(`select count(*)::int n from "BankAccount"`);
if (rows[0].n) console.log(`BankAccount already has ${rows[0].n} rows — updating dummy IBANs where empty`);
for (const [i, [name, code]] of BANKS.entries()) {
  const up = await c.query(`update "BankAccount" set iban=$2, active=true, "updatedAt"=now() where "bankName"=$1 and iban=''`, [name, iban(code)]);
  if (!up.rowCount && !rows[0].n) await c.query(`insert into "BankAccount"(id,"bankName","accountHolder",iban,currency,active,"sortOrder","createdAt","updatedAt") values($1,$2,'Mezbaha Teknolojileri A.Ş.',$3,'TRY',true,$4,now(),now())`, [`demo${randomBytes(10).toString("hex")}`, name, iban(code), i * 10]);
}
console.log((await c.query(`select "bankName", iban, active from "BankAccount" order by "sortOrder"`)).rows);
await c.end();
