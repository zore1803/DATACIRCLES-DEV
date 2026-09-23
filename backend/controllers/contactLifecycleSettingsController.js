// controllers/contactLifecycleSettingsController.js
const Contact = require("../models/Contact");
const { getOrCreateSettings } = require("../services/contactLifecycleService");

const getSettings = async (req, res) => {
  try {
    const doc = await getOrCreateSettings(req.user.organization);
    res.json(doc);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch contact lifecycle settings: " + err.message,
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { stages } = req.body;
    if (!Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ error: "At least one lifecycle stage is required" });
    }

    // Shape + uniqueness validation: stage names unique, each stage has at
    // least one status, and no status appears under two stages — a status
    // must resolve to exactly one stage (see stageForStatusInMap), the same
    // invariant the old hardcoded map guaranteed by construction.
    const stageNames = new Set();
    const statusNames = new Set();
    for (const stage of stages) {
      const name = (stage?.name || "").trim();
      if (!name) {
        return res.status(400).json({ error: "Every stage needs a name" });
      }
      if (stageNames.has(name)) {
        return res.status(400).json({ error: `Duplicate stage name "${name}"` });
      }
      stageNames.add(name);
      if (!Array.isArray(stage.statuses) || stage.statuses.length === 0) {
        return res.status(400).json({ error: `Stage "${name}" needs at least one status` });
      }
      for (const status of stage.statuses) {
        if (statusNames.has(status)) {
          return res.status(400).json({
            error: `Status "${status}" is used in more than one stage`,
          });
        }
        statusNames.add(status);
      }
    }

    const existing = await getOrCreateSettings(req.user.organization);

    // Block removing a stage or status that existing contacts still use —
    // same "in use" guard kanbanBoardController applies to deal stages.
    const oldStageNames = existing.stages.map((s) => s.name);
    const oldStatusNames = existing.stages.flatMap((s) => s.statuses);
    const removedStages = oldStageNames.filter((n) => !stageNames.has(n));
    const removedStatuses = oldStatusNames.filter((n) => !statusNames.has(n));

    if (removedStages.length || removedStatuses.length) {
      const counts = await Contact.aggregate([
        {
          $match: {
            organization: existing.organization,
            $or: [
              { lifecycleStage: { $in: removedStages } },
              { stageStatus: { $in: removedStatuses } },
            ],
          },
        },
        { $group: { _id: "$lifecycleStage", count: { $sum: 1 } } },
      ]);
      if (counts.length > 0) {
        const blocked = counts[0];
        return res.status(409).json({
          error: `Cannot remove "${blocked._id}" — it still has ${blocked.count} contact${
            blocked.count === 1 ? "" : "s"
          } in it. Move or reassign those contacts first.`,
        });
      }
    }

    existing.stages = stages.map((s) => ({
      name: s.name.trim(),
      statuses: s.statuses,
    }));
    await existing.save();
    res.json(existing);
  } catch (err) {
    res.status(400).json({
      error: "Failed to update contact lifecycle settings: " + err.message,
    });
  }
};

module.exports = { getSettings, updateSettings };
