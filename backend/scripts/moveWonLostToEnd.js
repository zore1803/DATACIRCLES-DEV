/*
 * Puts the system stages (Won, Lost) at the END of every organization's deal pipeline.
 *
 * Boards created before Won/Lost became draggable have them wherever the first custom stage was
 * appended after them, e.g. ["Open", "Won", "Lost", "Qualified", "Proposal"]. Won and Lost are meant
 * to default to the end of the pipeline, so this moves them there, keeping the custom stages in their
 * current order and Won/Lost in their current relative order:
 *   ["Open", "Won", "Lost", "Qualified", "Proposal"]  ->  ["Open", "Qualified", "Proposal", "Won", "Lost"]
 *
 * Only the order of KanbanBoard.statuses changes. No deal is touched (a deal stores its stage by
 * name), no stage is added, renamed or removed. A board already ending in Won/Lost is skipped, and
 * once users start dragging them elsewhere on purpose, do NOT re-run this: it would move them back.
 *
 *   node scripts/moveWonLostToEnd.js            # dry run: lists the boards that would change
 *   node scripts/moveWonLostToEnd.js --apply
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config({ path: path.join(__dirname, '../.env') });

const KanbanBoard = require('../models/KanbanBoard');

const APPLY = process.argv.includes('--apply');
const SYSTEM = ['Won', 'Lost'];

const withSystemStagesLast = (statuses) => [
  ...statuses.filter((s) => !SYSTEM.includes(s)),
  ...statuses.filter((s) => SYSTEM.includes(s)),
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Database: ${mongoose.connection.name}`);

  const boards = await KanbanBoard.find({}).select('statuses organization');
  const changes = boards
    .map((board) => ({ board, next: withSystemStagesLast(board.statuses || []) }))
    .filter(({ board, next }) => next.join('\u0000') !== (board.statuses || []).join('\u0000'));

  console.log(`\nBoards: ${boards.length} total, ${changes.length} would change, ${boards.length - changes.length} already fine.`);
  changes.slice(0, 15).forEach(({ board, next }) => {
    console.log(`  ${board._id}  [${board.statuses.join(', ')}]  ->  [${next.join(', ')}]`);
  });
  if (changes.length > 15) console.log(`  ... and ${changes.length - 15} more`);

  if (!APPLY) {
    console.log('\nDRY RUN: re-run with --apply to make these changes.');
    await mongoose.disconnect();
    return;
  }

  for (const { board, next } of changes) {
    await KanbanBoard.updateOne({ _id: board._id }, { $set: { statuses: next } });
  }
  console.log(`\nApplied: reordered ${changes.length} board(s).`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
