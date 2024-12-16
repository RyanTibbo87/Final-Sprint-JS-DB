// Establish a WebSocket connection to the server
const socket = new WebSocket("ws://localhost:3000/ws");

// Listen for messages from the server
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  // Handle events based on their type
  switch (data.type) {
    case "new_poll":
      onNewPollAdded(data.poll);
      break;
    case "vote_update":
      onIncomingVote(data.poll);
      break;
    default:
      console.warn("Unknown event type:", data.type);
  }
});

/**
 * Handles adding a new poll to the page when one is received from the server
 *
 * @param {*} data The data from the server (containing the new poll's ID, question, and options)
 */
function onNewPollAdded(data) {
  const pollContainer = document.getElementById("polls");

  // Create the poll structure dynamically
  const newPoll = document.createElement("li");
  newPoll.className = "poll-container";
  newPoll.id = data._id;

  newPoll.innerHTML = `
        <h2>${data.question}</h2>
        <ul class="poll-options">
            ${data.options
              .map(
                (option) => `
                <li id="${data._id}_${option.answer}">
                    <strong>${option.answer}:</strong> ${option.votes} votes
                </li>
            `
              )
              .join("")}
        </ul>
        <form class="poll-form button-container">
            ${data.options
              .map(
                (option) => `
                <button class="action-button vote-button" type="submit" value="${option.answer}" name="poll-option">
                    Vote for ${option.answer}
                </button>
            `
              )
              .join("")}
            <input type="hidden" value="${data._id}" name="poll-id" />
        </form>
    `;

  pollContainer.appendChild(newPoll);

  // Add event listeners to the new poll's vote buttons
  newPoll.querySelectorAll(".poll-form").forEach((pollForm) => {
    pollForm.addEventListener("submit", onVoteClicked);
  });
}

/**
 * Handles updating the number of votes an option has when a new vote is received from the server
 *
 * @param {*} data The data from the server (contains poll ID, updated options with votes)
 */
function onIncomingVote(data) {
  const pollId = data._id;

  // Update each option's vote count dynamically
  data.options.forEach((option) => {
    const optionElement = document.getElementById(`${pollId}_${option.answer}`);
    if (optionElement) {
      optionElement.innerHTML = `<strong>${option.answer}:</strong> ${option.votes} votes`;
    }
  });
}

/**
 * Handles processing a user's vote when they click on an option to vote
 *
 * @param {Event} event The form event sent after the user clicks a poll option to "submit" the form
 */
function onVoteClicked(event) {
  event.preventDefault(); // Prevent default form submission

  const formData = new FormData(event.target);
  const pollId = formData.get("poll-id"); // Get the poll ID
  const selectedOption = event.submitter.value; // Get the clicked button value

  // Send a POST request to the server
  fetch("/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pollId, selectedOption }),
  })
    .then((response) => {
      if (response.ok) {
        window.location.reload(); // Reload the page to reflect updates
      } else {
        alert("Error voting. Please try again.");
      }
    })
    .catch((err) => console.error("Error:", err));
}
