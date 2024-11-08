initialize();

async function initialize() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const sessionId = urlParams.get("session_id");
  const response = await fetch(`/session-status?session_id=${sessionId}`);
  const session = await response.json();

  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://turismoproject.onrender.com"
      : "http://localhost:3000";

  if (session.status == "open") {
    window.location.replace(`${baseUrl}/checkout.html`);
  } else if (session.status == "complete") {
    document.getElementById("success").classList.remove("hidden");
    document.getElementById("customer-email").textContent =
      session.customer_email;
  }
}
