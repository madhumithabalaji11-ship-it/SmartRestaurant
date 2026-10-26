import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import StaffDashboard from "./pages/StaffDashboard";
import "./App.css";

const API_URL = "http://localhost:5000";

type Restaurant = {
  id: string;
  name: string;
  total_tables: number;
  available_tables: number;
  waiting_customers: number;
  estimated_wait_minutes: number;
};

type Table = {
  id: string;
  restaurant_id: string;
  table_number: number;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED";
};

type QueueItem = {
  id: string;
  restaurant_id: string;
  customer_name: string;
  party_size: number;
  token_number: number;
  status: string;
  joined_at: string;
};

type QueueStatusUpdate = {
  customer?: {
    id: string;
    token_number: number;
    customer_name: string;
    party_size: number;
    status: string;
    table_number?: number;
  };
};

function App() {
  const [restaurant, setRestaurant] =
    useState<Restaurant | null>(null);

  const [tables, setTables] =
    useState<Table[]>([]);

  const [queue, setQueue] =
    useState<QueueItem[]>([]);

  const [customerName, setCustomerName] =
    useState("");

  const [partySize, setPartySize] =
    useState(2);

  const [showStaff, setShowStaff] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [assignmentMessage, setAssignmentMessage] =
    useState("");

  const [assignedTable, setAssignedTable] =
    useState<number | null>(null);

  // LIVE CUSTOMER STATUS
  const [myToken, setMyToken] =
    useState<number | null>(null);

  const [liveStatusMessage, setLiveStatusMessage] =
    useState("");

  const [liveAssignedTable, setLiveAssignedTable] =
    useState<number | null>(null);

  // ==========================================
  // FETCH RESTAURANT
  // ==========================================

  const fetchRestaurant = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/restaurants`
      );

      const data = await response.json();

      if (Array.isArray(data)) {
        setRestaurant(data[0] || null);
      } else {
        setRestaurant(data);
      }
    } catch (error) {
      console.error(
        "Failed to fetch restaurant:",
        error
      );
    }
  };

  // ==========================================
  // FETCH TABLES
  // ==========================================

  const fetchTables = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/tables`
      );

      const data = await response.json();

      setTables(data);
    } catch (error) {
      console.error(
        "Failed to fetch tables:",
        error
      );
    }
  };

  // ==========================================
  // FETCH QUEUE
  // ==========================================

  const fetchQueue = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/queue`
      );

      const data = await response.json();

      setQueue(data);
    } catch (error) {
      console.error(
        "Failed to fetch queue:",
        error
      );
    }
  };

  // ==========================================
  // INITIAL DATA
  // ==========================================

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchRestaurant(),
        fetchTables(),
        fetchQueue()
      ]);

      setLoading(false);
    };

    loadData();
  }, []);

  // ==========================================
  // SOCKET.IO
  // ==========================================

  useEffect(() => {
    const socket = io(API_URL);

    console.log(
      "Connecting to Smart Restaurant server..."
    );

    socket.on("connect", () => {
      console.log(
        "Connected to Socket.IO:",
        socket.id
      );
    });

    // TABLE STATUS UPDATED
    socket.on(
      "tableStatusUpdated",
      () => {
        fetchTables();
        fetchRestaurant();
      }
    );

    // QUEUE UPDATED
    socket.on(
      "queueUpdated",
      () => {
        fetchQueue();
        fetchRestaurant();
      }
    );

    // ==========================================
    // CUSTOMER LIVE STATUS
    // ==========================================

    socket.on(
      "queueStatusUpdated",
      (data: QueueStatusUpdate) => {
        const customer =
          data?.customer;

        if (!customer) {
          return;
        }

        if (
          myToken !== null &&
          customer.token_number === myToken
        ) {
          if (
            customer.status === "SEATED"
          ) {
            setLiveStatusMessage(
              `Your Token #${customer.token_number} has been seated. Please proceed to Table ${customer.table_number}.`
            );

            if (
              customer.table_number !==
              undefined
            ) {
              setLiveAssignedTable(
                customer.table_number
              );
            }
          }

          if (
            customer.status === "WAITING"
          ) {
            setLiveStatusMessage(
              `Your Token #${customer.token_number} is waiting for a suitable table.`
            );
          }

          fetchQueue();
          fetchTables();
          fetchRestaurant();
        }
      }
    );

    socket.on("disconnect", () => {
      console.log(
        "Disconnected from Socket.IO"
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [myToken]);

  // ==========================================
  // JOIN QUEUE / ASSIGN TABLE
  // ==========================================

  const joinQueue = async () => {
    if (!customerName.trim()) {
      alert(
        "Please enter your name."
      );
      return;
    }

    if (partySize < 1) {
      alert(
        "Party size must be at least 1."
      );
      return;
    }

    setAssignmentMessage("");
    setAssignedTable(null);
    setLiveStatusMessage("");
    setLiveAssignedTable(null);
    setMyToken(null);

    try {
      const response =
        await fetch(
          `${API_URL}/api/queue/assign`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              customer_name:
                customerName,
              party_size:
                partySize
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        alert(
          data.message ||
            "Unable to process request."
        );

        return;
      }

      // ========================================
      // TABLE ASSIGNED IMMEDIATELY
      // ========================================

      if (data.assigned) {
        const tableNumber =
          data.table.table_number;

        setAssignedTable(
          tableNumber
        );

        setLiveAssignedTable(
          tableNumber
        );

        setAssignmentMessage(
          `Table ${tableNumber} has been automatically assigned to you!`
        );

        setLiveStatusMessage(
          `Your table is ready. Please proceed to Table ${tableNumber}.`
        );
      }

      // ========================================
      // CUSTOMER ADDED TO QUEUE
      // ========================================

      else if (data.queued) {
        const token =
          data.customer.token_number;

        setMyToken(token);

        setLiveStatusMessage(
          `Your Token #${token} is waiting for a suitable table.`
        );

        setAssignmentMessage(
          `No suitable table is available. You have been added to the queue with Token #${token}.`
        );
      }

      setCustomerName("");
      setPartySize(2);

      await Promise.all([
        fetchRestaurant(),
        fetchTables(),
        fetchQueue()
      ]);
    } catch (error) {
      console.error(error);

      alert(
        "Unable to connect to the server."
      );
    }
  };

  // ==========================================
  // STAFF VIEW
  // ==========================================

  if (showStaff) {
    return (
      <div className="app">

        <nav className="navbar">

          <div className="logo">
            Smart Restaurant
          </div>

          <button
            className="staff-btn"
            onClick={() =>
              setShowStaff(false)
            }
          >
            Back to Customer View
          </button>

        </nav>

        <StaffDashboard />

      </div>
    );
  }

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="app">

        <div className="loading">
          Loading Smart Restaurant...
        </div>

      </div>
    );
  }

  // ==========================================
  // CUSTOMER VIEW
  // ==========================================

  return (
    <div className="app">

      {/* NAVBAR */}

      <nav className="navbar">

        <div className="logo">
          Smart Restaurant
        </div>

        <div className="nav-links">

          <a href="#home">
            Home
          </a>

          <a href="#tables">
            Tables
          </a>

          <a href="#queue">
            Queue
          </a>

          <button
            className="staff-btn"
            onClick={() =>
              setShowStaff(true)
            }
          >
            Staff Login
          </button>

        </div>

      </nav>

      {/* HERO */}

      <section
        className="hero"
        id="home"
      >

        <div className="hero-content">

          <p className="hero-label">
            SMART DINING EXPERIENCE
          </p>

          <h1>
            Check table availability
            <br />
            before you arrive.
          </h1>

          <p className="hero-description">
            View real-time restaurant
            availability and estimated
            waiting time before visiting.
          </p>

          <a
            href="#tables"
            className="primary-btn"
          >
            View Tables
          </a>

        </div>

      </section>

      {/* RESTAURANT SUMMARY */}

      <section
        className="restaurant-summary"
        id="tables"
      >

        <div className="section-container">

          <div className="restaurant-header">

            <div>

              <h2>
                {restaurant?.name ||
                  "Smart Restaurant"}
              </h2>

              <span className="status-badge">
                OPEN
              </span>

            </div>

          </div>

          <div className="summary-grid">

            <div className="summary-card">

              <span className="summary-number">
                {restaurant?.available_tables ||
                  0}
              </span>

              <span className="summary-label">
                Available Tables
              </span>

            </div>

            <div className="summary-card">

              <span className="summary-number">
                {restaurant?.waiting_customers ||
                  0}
              </span>

              <span className="summary-label">
                Waiting Customers
              </span>

            </div>

            <div className="summary-card">

              <span className="summary-number">

                {restaurant?.estimated_wait_minutes ||
                  0}

                <span className="unit">
                  {" "}
                  min
                </span>

              </span>

              <span className="summary-label">
                Estimated Wait
              </span>

            </div>

          </div>

        </div>

      </section>

      {/* TABLE AVAILABILITY */}

      <section className="tables-section">

        <div className="section-container">

          <div className="section-heading">

            <h2>
              Table Availability
            </h2>

            <p>
              Total tables:{" "}
              <strong>
                {restaurant?.total_tables ||
                  0}
              </strong>
            </p>

            <p>
              Currently available:{" "}
              <strong>
                {restaurant?.available_tables ||
                  0}
              </strong>
            </p>

          </div>

          <div className="table-grid">

            {tables.map(
              (table) => (

                <div
                  className="table-card"
                  key={table.id}
                >

                  <div className="table-header">

                    <h3>
                      Table{" "}
                      {table.table_number}
                    </h3>

                    <span
                      className={`table-status ${table.status.toLowerCase()}`}
                    >
                      {table.status}
                    </span>

                  </div>

                  <p>
                    Capacity:{" "}
                    {table.capacity}
                  </p>

                </div>

              )
            )}

          </div>

        </div>

      </section>

      {/* QUEUE */}

      <section
        className="queue-section"
        id="queue"
      >

        <div className="section-container">

          <div className="section-heading">

            <h2>
              Join the Queue
            </h2>

            <p>
              Customers currently waiting:{" "}
              <strong>
                {restaurant?.waiting_customers ||
                  0}
              </strong>
            </p>

            <p>
              Estimated waiting time:{" "}
              <strong>
                {restaurant?.estimated_wait_minutes ||
                  0}{" "}
                minutes
              </strong>
            </p>

          </div>

          <div className="queue-form">

            <div className="form-group">

              <label>
                Customer Name
              </label>

              <input
                type="text"
                value={customerName}
                onChange={(event) =>
                  setCustomerName(
                    event.target.value
                  )
                }
                placeholder="Enter your name"
              />

            </div>

            <div className="form-group">

              <label>
                Party Size
              </label>

              <input
                type="number"
                min="1"
                value={partySize}
                onChange={(event) =>
                  setPartySize(
                    Number(
                      event.target.value
                    )
                  )
                }
              />

            </div>

            <button
              className="primary-btn"
              onClick={joinQueue}
            >
              Find Table / Join Queue
            </button>

          </div>

          {/* TABLE ASSIGNMENT */}

          {assignmentMessage && (

            <div className="current-queue">

              <h2>
                Table Assignment
              </h2>

              <p>
                {assignmentMessage}
              </p>

              {assignedTable && (

                <p>
                  <strong>
                    Assigned Table:{" "}
                    {assignedTable}
                  </strong>
                </p>

              )}

            </div>

          )}

          {/* LIVE STATUS */}

          {liveStatusMessage && (

            <div className="current-queue">

              <h2>
                Live Status
              </h2>

              <p>
                {liveStatusMessage}
              </p>

              {myToken !== null && (

                <p>
                  <strong>
                    Your Token: #{myToken}
                  </strong>
                </p>

              )}

              {liveAssignedTable !== null && (

                <p>
                  <strong>
                    Your Table: Table{" "}
                    {liveAssignedTable}
                  </strong>
                </p>

              )}

            </div>

          )}

          {/* CURRENT QUEUE */}

          <div className="current-queue">

            <h2>
              Current Queue
            </h2>

            {queue.length === 0 ? (

              <p className="empty-queue">
                No customers are currently
                waiting.
              </p>

            ) : (

              <div className="queue-list">

                {queue.map(
                  (item) => (

                    <div
                      className="queue-item"
                      key={item.id}
                    >

                      <div>

                        <strong>
                          Token #
                          {
                            item.token_number
                          }
                        </strong>

                        <p>
                          {
                            item.customer_name
                          }
                        </p>

                      </div>

                      <div>

                        <p>
                          Party:{" "}
                          {
                            item.party_size
                          }
                        </p>

                        <span className="queue-status">
                          {item.status}
                        </span>

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </div>

        </div>

      </section>

    </div>
  );
}

export default App;