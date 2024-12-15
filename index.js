const express = require("express");
const expressWs = require("express-ws");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");

const PORT = 3000;
//TODO: Update this URI to match your own MongoDB setup
const MONGO_URI = "mongodb://localhost:27017/keyin_test";
const app = express();
expressWs(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(
  session({
    secret: "voting-app-secret",
    resave: false,
    saveUninitialized: false,
  })
);
let connectedClients = [];

//Note: Not all routes you need are present here, some are missing and you'll need to add them yourself.

app.ws("/ws", (socket, request) => {
  connectedClients.push(socket);

  socket.on("message", async (message) => {
    const data = JSON.parse(message);

    if (data.type === "vote") {
      const { pollId, selectedOption } = data;
      const poll = await mongoose.model("poll").findById(pollId);

      if (poll) {
        const option = poll.options.find(
          (opt) => opt.answer === selectedOption
        );
        if (option) {
          option.votes += 1;
          await poll.save();

          // Notify all clients about the vote update
          connectedClients.forEach((client) => {
            client.send(JSON.stringify({ type: "vote_update", poll }));
          });
        }
      }
    }
  });

  socket.on("close", () => {
    connectedClients = connectedClients.filter((client) => client !== socket);
  });
});

app.get("/", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }

  response.render("index/unauthenticatedIndex", {});
});

app.get("/login", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }
  response.render("signup", { errorMessage: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await mongoose.model("user").findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render("signup", {
        errorMessage: "Invalid username or password",
      });
    }

    req.session.user = { id: user._id, username: user.username };
    return res.redirect("/dashboard");
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).send("An error occurred while logging in.");
  }
});

app.get("/signup", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }

  return response.render("signup", { errorMessage: null });
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.user?.id) {
    return res.redirect("/");
  }

  try {
    const polls = await mongoose.model("poll").find(); // Fetch polls
    res.render("index/authenticatedIndex", { polls });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("An error occurred while loading the dashboard.");
  }
});

app.get("/profile", async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect("/");
  }

  const user = await mongoose.model("User").findById(request.session.user.id);
  const pollsVoted = await mongoose
    .model("Poll")
    .find({ "options.voters": user._id });

  response.render("profile", { username: user.username, pollsVoted });
});

app.get("/createPoll", async (request, response) => {
  if (!request.session.user?.id) {
    return response.redirect("/");
  }

  return response.render("createPoll");
});

// Poll creation
app.post("/createPoll", async (req, res) => {
  const { question, options } = req.body;

  const formattedOptions = options.map((option) => ({
    answer: option,
    votes: 0,
  }));

  try {
    const newPoll = new mongoose.model("poll")({
      question,
      options: formattedOptions,
      createdBy: req.session.user.id, // Associate poll with user
    });

    await newPoll.save();

    // Notify WebSocket clients
    connectedClients.forEach((client) => {
      client.send(JSON.stringify({ type: "new_poll", poll: newPoll }));
    });

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Poll creation error:", error);
    res.status(500).send("An error occurred while creating the poll.");
  }
});

mongoose
  .connect(MONGO_URI)
  .then(() =>
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    )
  )
  .catch((err) => console.error("MongoDB connection error:", err));

/**
 * Handles creating a new poll, based on the data provided to the server
 *
 * @param {string} question The question the poll is asking
 * @param {[answer: string, votes: number]} pollOptions The various answers the poll allows and how many votes each answer should start with
 * @returns {string?} An error message if an error occurs, or null if no error occurs.
 */
async function onCreateNewPoll(question, pollOptions) {
  try {
    //TODO: Save the new poll to MongoDB
  } catch (error) {
    console.error(error);
    return "Error creating the poll, please try again";
  }

  //TODO: Tell all connected sockets that a new poll was added

  return null;
}

/**
 * Handles processing a new vote on a poll
 *
 * This function isn't necessary and should be removed if it's not used, but it's left as a hint to try and help give
 * an idea of how you might want to handle incoming votes
 *
 * @param {string} pollId The ID of the poll that was voted on
 * @param {string} selectedOption Which option the user voted for
 */
async function onNewVote(pollId, selectedOption) {
  try {
  } catch (error) {
    console.error("Error updating poll:", error);
  }
}
