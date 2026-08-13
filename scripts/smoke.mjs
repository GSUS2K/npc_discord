const database = await import('../dist/database/index.js');
const commandsModule = await import('../dist/commands/index.js');

const tables = database.db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
  .all()
  .filter((row) => !row.name.startsWith('sqlite_'));
const commands = commandsModule.commandData.map((command) => command.toJSON());

if (tables.length < 15 || commands.length < 15)
  throw new Error(`Smoke-test counts failed: ${tables.length} tables, ${commands.length} commands`);
console.log(
  JSON.stringify({
    tables: tables.length,
    commands: commands.length,
    sqlite: database.db.prepare('SELECT sqlite_version() version').get(),
  }),
);
database.db.close();
