const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;
const app = express();

app.use(
  cors({
    origin: "https://turismoimperial.netlify.app", // Origen permitido
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Permite enviar cookies y encabezados de autenticación
  })
);

const corsOptions = {
  origin: "https://turismoimperial.netlify.app",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.use(express.static("public"));
app.use(bodyParser.json());

const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: "https://turismoimperial.netlify.app",
//     methods: ["GET", "POST"],
//   },
// });

const io = require("socket.io")(server, {
  cors: {
    origin: "https://turismoimperial.netlify.app",
    methods: ["GET", "POST"],
    credentials: true,
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
      socket.emit("seatOccupied", {
        seat,
        message: "Este asiento ya ha sido seleccionado.",
      });
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
  socket.on("connect_error", (err) => {
    console.log("Error de conexión:", err);
  });
});

const YOUR_DOMAIN =
  process.env.NODE_ENV === "production"
    ? "https://turismoproject.onrender.com"
    : "http://localhost:3000";

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
    res.status(500).send({
      error:
        "Ocurrió un error al procesar tu pago. Intenta nuevamente más tarde o contacta con soporte.",
    });
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
      res.redirect("/support");
    }
  } catch (error) {
    console.error("Error retrieving invoice:", error);
    res.redirect("/support");
  }
}
app.get("/purchase-completed", async (req, res) => {
  try {
    const invoicePDFLink = await getInvoicePDF(req.query.invoiceId);
    res.render("purchase-completed", { invoicePDFLink });
  } catch (error) {
    console.error("Error al obtener el PDF de la factura:", error);
    res.status(500).send("Error al obtener el PDF de la factura.");
  }
});

async function sendInvoice(invoiceId) {
  try {
    const invoice = await stripe.invoices.sendInvoice(invoiceId);
    console.log("Factura enviada:", invoice);
  } catch (error) {
    console.error("Error al enviar la factura:", error);
  }
}

app.post("/webhook", express.json(), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === "invoice.payment_failed") {
    const invoiceId = event.data.object.id;
    console.log(`El pago ha fallado para la factura: ${invoiceId}`);
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoiceId = event.data.object.id;
    sendInvoice(invoiceId);
  } else if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log("Pago completado para la sesión:", session);
  } else {
    console.log(`Evento no manejado: ${event.type}`);
  }

  res.status(200).send("Evento recibido");
});

// inicia en el puerto 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
