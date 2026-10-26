import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API_URL = "http://localhost:5000";

const socket = io(API_URL);

type Table = {
  id?: string;
  _id?: string;
  restaurant_id?: string;
  table_number: number;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED";
};

type QueueItem = {
  id?: string;
  _id?: string;
  customer_name: string;
  party_size: number;
  token_number: number;
  status: "WAITING" | "SEATED";
};

function StaffDashboard() {
  const [tables, setTables] = useState<Table[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seating, setSeating] = useState(false);
  const [message, setMessage] = useState("");

  const fetchTables = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/tables`
      );

      const data = await response.json();

      if (response.ok) {
        setTables(data);
      }
    } catch (error) {
      console.error(
        "Failed to fetch tables:",
        error
      );
    }
  };

  const fetchQueue = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/queue`
      );

      const data = await response.json();

      if (response.ok) {
        setQueue(data);
      }
    } catch (error) {
      console.error(
        "Failed to fetch queue:",
        error
      );
    }
  };

  const fetchData = async () => {
    setLoading(true);

    await Promise.all([
      fetchTables(),
      fetchQueue()
    ]);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    socket.on(
      "tableStatusUpdated",
      () => {
        fetchTables();
      }
    );

    socket.on(
      "queueUpdated",
      () => {
        fetchQueue();
      }
    );

    socket.on(
      "queueStatusUpdated",
      () => {
        fetchQueue();
      }
    );

    return () => {
      socket.off(
        "tableStatusUpdated"
      );

      socket.off(
        "queueUpdated"
      );

      socket.off(
        "queueStatusUpdated"
      );
    };
  }, []);

  const changeStatus = async (
    table: Table
  ) => {
    const tableId =
      table.id || table._id;

    if (!tableId) {
      alert(
        `Table ${table.table_number} does not have a valid ID.`
      );

      return;
    }

    let newStatus: Table["status"];

    if (
      table.status === "AVAILABLE"
    ) {
      newStatus = "OCCUPIED";
    } else if (
      table.status === "OCCUPIED"
    ) {
      newStatus = "AVAILABLE";
    } else {
      newStatus = "AVAILABLE";
    }

    try {
      const response = await fetch(
        `${API_URL}/api/tables/${tableId}/status`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            status: newStatus
          })
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        alert(
          data.message ||
            "Failed to update table status."
        );

        return;
      }

      await fetchTables();
    } catch (error) {
      console.error(
        "Failed to update table:",
        error
      );

      alert(
        "Unable to update table status."
      );
    }
  };

  const seatNextCustomer =
    async () => {
      setSeating(true);
      setMessage("");

      try {
        const response =
          await fetch(
            `${API_URL}/api/queue/seat-next`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              }
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          setMessage(
            data.message ||
              "Unable to seat customer."
          );

          return;
        }

        setMessage(
          `Token #${data.customer.token_number} - ${data.customer.customer_name} has been seated at Table ${data.table.table_number}.`
        );

        await fetchData();
      } catch (error) {
        console.error(
          "Failed to seat customer:",
          error
        );

        setMessage(
          "Unable to connect to the backend server."
        );
      } finally {
        setSeating(false);
      }
    };

  const waitingCustomers =
    queue.filter(
      (customer) =>
        customer.status ===
        "WAITING"
    );

  if (loading) {
    return (
      <div className="staff-dashboard">
        <h2>
          Staff Dashboard
        </h2>

        <p>
          Loading dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="staff-dashboard">

      <h2>
        Staff Dashboard
      </h2>

      {/* ================================
          QUEUE MANAGEMENT
      ================================= */}

      <div className="staff-section">

        <h3>
          Queue Management
        </h3>

        <p>
          Waiting Customers:{" "}
          <strong>
            {waitingCustomers.length}
          </strong>
        </p>

        <button
          onClick={
            seatNextCustomer
          }
          disabled={
            seating ||
            waitingCustomers.length ===
              0
          }
        >
          {seating
            ? "Seating Customer..."
            : "Seat Next Customer"}
        </button>

        {message && (
          <p className="staff-message">
            {message}
          </p>
        )}

      </div>

      {/* ================================
          TABLE MANAGEMENT
      ================================= */}

      <div className="staff-section">

        <h3>
          Table Management
        </h3>

        <div className="table-grid">

          {tables.map(
            (table) => (
              <div
                className="table-card"
                key={
                  table.id ||
                  table._id ||
                  table.table_number
                }
              >

                <h3>
                  Table{" "}
                  {table.table_number}
                </h3>

                <p>
                  <strong>
                    {table.status}
                  </strong>
                </p>

                <p>
                  Capacity:{" "}
                  {table.capacity}
                </p>

                <button
                  onClick={() =>
                    changeStatus(
                      table
                    )
                  }
                >
                  Change Status
                </button>

              </div>
            )
          )}

        </div>

      </div>

      {/* ================================
          WAITING QUEUE
      ================================= */}

      <div className="staff-section">

        <h3>
          Waiting Queue
        </h3>

        {waitingCustomers.length ===
        0 ? (
          <p>
            No customers are waiting.
          </p>
        ) : (
          <div className="queue-list">

            {waitingCustomers.map(
              (customer) => (
                <div
                  className="queue-card"
                  key={
                    customer.id ||
                    customer._id ||
                    customer.token_number
                  }
                >

                  <p>
                    <strong>
                      Token #
                      {
                        customer.token_number
                      }
                    </strong>
                  </p>

                  <p>
                    Customer:{" "}
                    {
                      customer.customer_name
                    }
                  </p>

                  <p>
                    Party Size:{" "}
                    {
                      customer.party_size
                    }
                  </p>

                  <p>
                    Status:{" "}
                    {customer.status}
                  </p>

                </div>
              )
            )}

          </div>
        )}

      </div>

    </div>
  );
}

export default StaffDashboard;