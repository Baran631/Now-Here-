import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminUsers } from "../../lib/api";
import "./Admin.css";

function formatDate(value) {
  if (!value) return "Yok";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Yok";
  }
}

function formatKm(meters = 0) {
  return `${(Number(meters) / 1000).toFixed(1)} km`;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [data, setData] = useState({ users: [], summary: null });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    fetchAdminUsers()
      .then((result) => {
        if (!alive) return;
        setData({
          users: Array.isArray(result.users) ? result.users : [],
          summary: result.summary || null,
        });
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || "Kullanici listesi alinamadi.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.users;

    return data.users.filter((item) =>
      [
        item.firstName,
        item.lastName,
        item.avatarName,
        item.displayName,
        item.email,
        item.city,
        item.statusText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [data.users, query]);

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <main className="admin-page">
      <header className="admin-nav">
        <Link to="/" className="admin-brand">
          <span className="mini-emblem" aria-hidden="true" />
          NOW Here
        </Link>
        <nav>
          <Link to="/map">Harita</Link>
          <Link to="/profile">Profil</Link>
          <button type="button" onClick={handleLogout}>
            Cikis
          </button>
        </nav>
      </header>

      <section className="admin-hero">
        <div>
          <p className="admin-kicker">Admin paneli</p>
          <h1>Kullanici kayitlari</h1>
          <p>{user?.email} hesabi ile giris yaptin.</p>
        </div>
        <label className="admin-search">
          <span>Arama</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ad, e-posta, avatar veya sehir"
          />
        </label>
      </section>

      <section className="admin-summary" aria-label="Kayit ozeti">
        <article>
          <span>Toplam kullanici</span>
          <strong>{data.summary?.totalUsers ?? data.users.length}</strong>
        </article>
        <article>
          <span>Toplam paylasim</span>
          <strong>{data.summary?.totalPosts ?? 0}</strong>
        </article>
        <article>
          <span>Admin hesap</span>
          <strong>{data.summary?.admins ?? 0}</strong>
        </article>
      </section>

      <section className="admin-panel">
        {loading && <p className="admin-state">Yukleniyor...</p>}
        {error && <p className="admin-error">{error}</p>}
        {!loading && !error && !filteredUsers.length && <p className="admin-state">Kayit bulunamadi.</p>}

        {!loading && !error && !!filteredUsers.length && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Kullanici</th>
                  <th>E-posta</th>
                  <th>Profil</th>
                  <th>Aktivite</th>
                  <th>Kayit</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-avatar">
                          {item.profilePhoto ? (
                            <img src={item.profilePhoto} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span>{(item.firstName?.[0] || "N") + (item.lastName?.[0] || "H")}</span>
                          )}
                        </div>
                        <div>
                          <strong>{item.avatarName || item.displayName || "Isimsiz"}</strong>
                          <span>
                            {item.firstName} {item.lastName}
                            {item.isAdmin ? " - Admin" : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{item.email}</td>
                    <td>
                      <span>{item.city || "Sehir yok"}</span>
                      <small>{item.statusText || "Kesifte"}</small>
                    </td>
                    <td>
                      <span>{item.postsCount || 0} post</span>
                      <small>
                        {item.receivedLikes || 0} begeni - {item.commentsCount || 0} yorum - {formatKm(item.distanceMeters)}
                      </small>
                    </td>
                    <td>
                      <span>{formatDate(item.createdAt)}</span>
                      <small>Guncel: {formatDate(item.updatedAt)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
