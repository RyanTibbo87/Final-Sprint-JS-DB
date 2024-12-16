const express = require("express");
const expressWs = require("express-ws");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
require("./models/user");
require("./models/poll");

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

app.get("/login", (req, res) => {
  if (req.session.user?.id) {
    return res.redirect("/dashboard");
  }

  res.render("login", { errorMessage: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the user exists
    const user = await mongoose.model("user").findOne({ username });

    // If user doesn't exist or password is incorrect
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render("login", {
        errorMessage: "Invalid username or password",
      });
    }

    // Save the user in the session
    req.session.user = { id: user._id, username: user.username };
    res.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error.message, error.stack);
    res
      .status(500)
      .render("login", { errorMessage: "An error occurred while logging in" });
  }
});
// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error logging out:", err);
      return res.status(500).send("An error occurred while logging out.");
    }
    res.redirect("/"); // Redirect to home after logout
  });
});
app.use((req, res, next) => {
  res.locals.session = req.session; // Make session data available in EJS views
  next();
});

app.get("/signup", async (request, response) => {
  if (request.session.user?.id) {
    return response.redirect("/dashboard");
  }

  return response.render("signup", { errorMessage: null });
});
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the username already exists
    const existingUser = await mongoose.model("user").findOne({ username });
    if (existingUser) {
      return res.render("signup", { errorMessage: "Username already exists" });
    }

    // Create a new user
    const newUser = new mongoose.model("user")({ username, password });
    await newUser.save();

    // Store the user session and redirect
    req.session.user = { id: newUser._id, username: newUser.username };
    res.redirect("/dashboard");
  } catch (error) {
    // Log the error details
    console.error("Signup error:", error.message, error.stack);
    res
      .status(500)
      .render("signup", { errorMessage: "An error occurred while signing up" });
  }
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.user?.id) {
    return res.redirect("/login");
  }

  try {
    const polls = await mongoose.model("poll").find(); // Fetch all polls
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

app.get("/createPoll", async (req, res) => {
  if (!req.session.user?.id) {
    return res.redirect("/login"); // Redirect to login if user isn't logged in
  }
  res.render("createPoll"); // Render createPoll.ejs
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
app.post("/vote", async (req, res) => {
  const { pollId, pollOption } = req.body;

  try {
    // Find the poll by ID
    const poll = await mongoose.model("poll").findById(pollId);

    if (!poll) {
      return res.status(404).send("Poll not found");
    }

    // Find the selected option and increment the vote count
    const option = poll.options.find((opt) => opt.answer === pollOption);

    if (!option) {
      return res.status(400).send("Invalid poll option");
    }

    option.votes += 1; // Increment the vote count
    await poll.save(); // Save the updated poll

    // Send a WebSocket message to all clients with the updated poll
    connectedClients.forEach((client) => {
      client.send(
        JSON.stringify({
          type: "vote_update",
          poll: {
            _id: poll._id,
            options: poll.options,
          },
        })
      );
    });

    res.redirect("/dashboard"); // Redirect back to the dashboard
  } catch (error) {
    console.error("Error processing vote:", error.message);
    res.status(500).send("An error occurred while processing the vote.");
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
