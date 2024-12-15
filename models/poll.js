const mongoose = require("mongoose");

const pollSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [
    {
      answer: { type: String, required: true },
      votes: { type: Number, default: 0 },
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

const poll = mongoose.model("poll", pollSchema); // lowercase 'poll'
module.exports = poll;
