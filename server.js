const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const stripe = require("stripe")(
  "sk_test_51OqTwwJ5bCJjLaWJ2maitwEt6xrNDJefHFWiTMEvya4M4kSWPkXwkxR1H1zw8iCefeezKgkHeu9dm9n8ZgPEvexD00WEkNvagk"
);

const app = express();
const corsOptions = {
  origin: "https://turismoimperial.netlify.app",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.use(express.static("public"));
app.use(bodyParser.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://turismoimperial.netlify.app",
    methods: ["GET", "POST"],
  },
});

const seatOwners = {};
let selectedSeats = [];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("currentSelectedSeats", selectedSeats);

  socket.on("seatSelected", (seat) => {
    if (!selectedSeats.includes(seat)) {
      selectedSeats.push(seat);
      seatOwners[seat] = socket.id;
      io.emit("seatSelected", seat);
    } else {
      socket.emit("seatOccupied", seat);
    }
  });

  socket.on("seatDeselected", (seat) => {
    if (seatOwners[seat] === socket.id) {
      selectedSeats = selectedSeats.filter((s) => s !== seat);
      delete seatOwners[seat];
      io.emit("seatDeselected", seat);
    } else {
      socket.emit("notOwner", seat);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    Object.keys(seatOwners).forEach((seat) => {
      if (seatOwners[seat] === socket.id) {
        selectedSeats = selectedSeats.filter((s) => s !== seat);
        delete seatOwners[seat];
        io.emit("seatDeselected", seat);
      }
    });
  });
});

const YOUR_DOMAIN = "https://turismoproject.onrender.com";

app.post("/checkout", async (req, res) => {
  const items = req.body.items.map((item) => {
    return {
      price_data: {
        currency: "pen",
        product_data: {
          name: item.title,
          images: [item.image],
        },
        unit_amount: item.price * 100,
      },
      quantity: item.qty,
    };
  });

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: items,
      mode: "payment",
      success_url: `${YOUR_DOMAIN}/success.html`,
      cancel_url: `${YOUR_DOMAIN}/cancel.html`,
    });

    res.status(200).json(session);
  } catch (error) {
    console.error("Error al crear sesión de pago:", error);
    res.status(500).send("Error al crear sesión de pago");
  }
});

app.get("/session-status", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.query.session_id
    );

    res.send({
      status: session.status,
      customer_email: session.customer_details.email,
    });
  } catch (error) {
    console.error("Error al recuperar la sesión de pago:", error);
    res.status(500).send("Error al recuperar la sesión de pago");
  }
});
async function getInvoicePDF(invoiceId) {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice && invoice.invoice_pdf) {
      return invoice.invoice_pdf;
    } else {
      throw new Error("No invoice PDF available for this transaction.");
    }
  } catch (error) {
    console.error("Error retrieving invoice:", error);
  }
}
app.get("/purchase-completed", (req, res) => {
  const invoicePDFLink =
    "https://invoice.stripe.com/i/acct_1OqTwwJ5bCJjLaWJ/test_YWNjdF8xT3FUd3dKNWJDSmpMYVdKLF9SQXBiM3dpOXozUkNNdjhlYmROZTQzY25ZVkJHbEJMLDEyMTUyMTM2NQ0200ZPJBWyWd?s=db";
  res.render("purchase-completed", { invoicePDFLink });
});

async function sendInvoice(invoiceId) {
  try {
    const invoice = await stripe.invoices.sendInvoice(invoiceId);
    console.log("Factura enviada:", invoice);
  } catch (error) {
    console.error("Error al enviar la factura:", error);
  }
}

app.post("/webhook", express.json(), async (req, res) => {
  const event = req.body;

  if (event.type === "invoice.payment_succeeded") {
    const invoiceId = event.data.object.id;

    await sendInvoice(invoiceId);
  }

  res.json({ received: true });
});

// Inicia el servidor en un solo puerto (3000 por defecto)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
