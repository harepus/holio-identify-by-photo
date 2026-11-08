import type { Locale } from "../identify";
import { productLabel } from "./data";
import { median, type SessionEvent } from "./session";
import type { ShellStrings } from "./strings";

type Props = {
  events: SessionEvent[];
  company: string;
  warehouse: string;
  t: ShellStrings;
  locale: Locale;
};

export function PcPanel({ events, company, warehouse, t, locale }: Props) {
  const p = t.pc;
  const photo = events.flatMap((e) => (e.kind === "photo" ? [e] : []));
  const identified = photo.length;
  const first = photo.filter((e) => e.result.status !== "none" && e.result.firstSuggestion).length;
  const linked = photo.filter((e) => e.linked).length;
  const med = median(photo.filter((e) => e.result.status !== "none").map((e) => e.result.ms));
  const time = new Intl.DateTimeFormat(locale === "nb" ? "nb-NO" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const anyMock = events.some((e) => e.mock);

  return (
    <div className="desk-wrap">
      <div className="desk">
        <div className="desk-top">
          <span className="dot" />
          Holio
          <span className="sp" />
          <span className="desk-u">
            {company} · {warehouse}
          </span>
        </div>
        <div className="desk-body">
          <div className="desk-titlerow">
            <h1>{p.title}</h1>
            <span className="badge badge-b">{p.session}</span>
            {anyMock && <span className="chip-mock">{t.mock}</span>}
          </div>
          <div className="tiles">
            <Tile label={p.identified} value={String(identified)} />
            <Tile label={p.first} value={String(first)} />
            <Tile label={p.linked} value={String(linked)} />
            <Tile label={p.median} value={med === null ? "-" : `${Math.round(med / 1000)} s`} />
          </div>
          <div className="dt-scroll">
            <table className="dt">
              <thead>
                <tr>
                  <th>{p.when}</th>
                  <th>{p.product}</th>
                  <th>{p.order}</th>
                  <th>{p.result}</th>
                  <th>{p.by}</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted dt-empty">
                      {p.empty}
                    </td>
                  </tr>
                )}
                {[...events].reverse().map((e, i) => {
                  const product = e.kind === "photo" ? e.product : null;
                  return (
                    <tr key={i}>
                      <td>{time.format(e.at)}</td>
                      <td>
                        {product ? (
                          <>
                            <span className="dt-th">
                              <img src={product.image} alt="" />
                            </span>
                            {productLabel(product)}
                          </>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>{e.order}</td>
                      <td>
                        <div className="dt-badges">
                        {e.kind === "manual" ? (
                          <span className="badge">{p.manual}</span>
                        ) : (
                          <>
                            {e.result.status === "match" && <span className="badge badge-g">{p.match}</span>}
                            {e.result.status === "choose" && <span className="badge badge-b">{p.chose}</span>}
                            {e.result.status === "none" && <span className="badge badge-o">{p.deviation}</span>}
                            {e.linked && <span className="badge">{p.barcodeLinked}</span>}
                            {e.result.photos > 1 && <span className="badge">{p.photos(e.result.photos)}</span>}
                          </>
                        )}
                        {e.mock && <span className="chip-mock">{t.mock}</span>}
                        </div>
                      </td>
                      <td>{p.byValue}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <a className="link desk-back" href="#/">
        {p.backToOps}
      </a>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="tile-l">{label}</div>
      <div className="tile-v">{value}</div>
    </div>
  );
}
