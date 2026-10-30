// controllers/kanbanBoardController.js (new controller file for better organization)
const KanbanBoard = require('../models/KanbanBoard');
const Deal = require('../models/Deal');

// Won and Lost are the pipeline's system stages. They can sit anywhere in the pipeline (users drag
// them), but are never renamed or removed: other code identifies a closed deal by these names.
const SYSTEM_STAGES = ['Won', 'Lost'];

const createKanbanBoard = async (req, res) => {
  try {
    const boardData = {
      ...req.body,
      user: req.user.id,
      organization: req.user.organization
    };
    
    const board = new KanbanBoard(boardData);
    await board.save();
    
    // Populate user information
    await board.populate('user', 'name email');
    
    res.status(201).json(board);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create kanban board: ' + err.message });
  }
};

const getLatestKanbanBoard = async (req, res) => {
  try {
    const board = await KanbanBoard.findOne({ 
      organization: req.user.organization 
    })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });
    
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch kanban board: ' + err.message });
  }
};

const getAllKanbanBoards = async (req, res) => {
  try {
    const boards = await KanbanBoard.find({ 
      organization: req.user.organization 
    })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });
    
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch kanban boards: ' + err.message });
  }
};

const getKanbanBoardById = async (req, res) => {
  try {
    const board = await KanbanBoard.findOne({
      _id: req.params.id,
      organization: req.user.organization
    }).populate('user', 'name email');
    
    if (!board) {
      return res.status(404).json({ error: 'Kanban board not found' });
    }
    
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch kanban board: ' + err.message });
  }
};

const updateKanbanBoard = async (req, res) => {
  try {
    const board = await KanbanBoard.findOne({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!board) {
      return res.status(404).json({ error: 'Kanban board not found' });
    }

    let updateQuery = { statuses: req.body.statuses };

    // Enforce the system stages here as well as in the settings screen, so the API can't be used to
    // rename or drop them. A rename shows up as the old name going missing, same as a removal.
    if (Array.isArray(req.body.statuses)) {
      const missingSystem = SYSTEM_STAGES.filter(
        (stage) => (board.statuses || []).includes(stage) && !req.body.statuses.includes(stage)
      );
      if (missingSystem.length > 0) {
        return res.status(400).json({
          error: `"${missingSystem[0]}" is a system stage: it can be moved, but not renamed or removed.`,
        });
      }
    }

    // Block removing a stage that still has deals sitting in it. Only a
    // true deletion shrinks the array — a rename or reorder keeps the same
    // length, so checking length here (rather than trusting editIndex,
    // which the frontend never actually sends) avoids false-blocking a
    // rename just because the old name string briefly disappears from the
    // array.
    if (Array.isArray(req.body.statuses) && req.body.statuses.length < (board.statuses || []).length) {
      const removedStatuses = (board.statuses || []).filter(
        (s) => !req.body.statuses.includes(s)
      );
      if (removedStatuses.length > 0) {
        const counts = await Deal.aggregate([
          {
            $match: {
              organization: board.organization,
              status: { $in: removedStatuses },
            },
          },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);
        const blocked = counts.find((c) => c.count > 0);
        if (blocked) {
          return res.status(409).json({
            error: `Cannot delete "${blocked._id}" — it still has ${blocked.count} deal${blocked.count === 1 ? "" : "s"} in it. Move or reassign those deals first.`,
          });
        }
      }
    }

    // Only run deal updates if we actually renamed a status
    if (req.body.editIndex !== undefined && req.body.oldStatuses && req.body.statuses) {
      const oldStatus = req.body.oldStatuses[req.body.editIndex];
      const newStatus = req.body.statuses[req.body.editIndex];
      
      if (oldStatus !== newStatus) {
        // Update deals within the same organization only
        const updateResult = await Deal.updateMany(
          { 
            status: oldStatus,
            organization: req.user.organization // Filter by organization
          }, 
          { status: newStatus }
        );
        
        console.log(`Updated ${updateResult.modifiedCount} deals from "${oldStatus}" to "${newStatus}"`);
      }
    }

    const updatedBoard = await KanbanBoard.findByIdAndUpdate(
      req.params.id,
      updateQuery,
      { new: true, runValidators: true }
    ).populate('user', 'name email');

    res.json(updatedBoard);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update kanban board: ' + err.message });
  }
};

const deleteKanbanBoard = async (req, res) => {
  try {
    const board = await KanbanBoard.findOneAndDelete({
      _id: req.params.id,
      organization: req.user.organization
    });
    
    if (!board) {
      return res.status(404).json({ error: 'Kanban board not found' });
    }
    
    res.json({ message: 'Kanban board deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete kanban board: ' + err.message });
  }
};

module.exports = {
  createKanbanBoard,
  getLatestKanbanBoard,
  getAllKanbanBoards,
  getKanbanBoardById,
  updateKanbanBoard,
  deleteKanbanBoard
};
