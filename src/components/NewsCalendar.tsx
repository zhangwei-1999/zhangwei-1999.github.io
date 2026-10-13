import { useId, useMemo, useState, type CSSProperties } from "react";
import { news } from "../data/news";
import { availableNewsYears, buildActivityYear } from "../lib/calendar";
import type { Language } from "../types";

export function NewsCalendar({ language }: { language: Language }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [view, setView] = useState<"month" | "day">("month");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const tooltipId = useId();
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const activity = useMemo(() => buildActivityYear(news, year), [year]);
  const years = availableNewsYears(news, currentYear);
  const activeDay = activity.days.find((day) => day.date === activeKey);
  const activeMonth = activity.months.find((month) => month.key === activeKey);
  const activeEntries = activeDay?.entries ?? activeMonth?.entries ?? [];
  const monthlyCount = activity.total - activity.exactCount;
  const monthLabel = (month: number) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month, 1)),
    );
  const dateLabel = (date: string, monthly = false) =>
    new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      ...(monthly ? {} : { day: "numeric" }),
      timeZone: "UTC",
    }).format(new Date(`${date}${monthly ? "-01" : ""}T12:00:00Z`));
  const countLabel = (count: number) =>
    language === "zh"
      ? `${count} 条动态`
      : `${count} ${count === 1 ? "update" : "updates"}`;

  return (
    <section
      className="glass calendar-panel"
      aria-labelledby={`${tooltipId}-heading`}
    >
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">
            {language === "zh" ? "研究与生活的足迹" : "A little perspective"}
          </p>
          <h2 id={`${tooltipId}-heading`}>
            {language === "zh" ? "一年的点滴" : "A year in moments"}
          </h2>
        </div>
        <label className="calendar-year">
          <span className="sr-only">
            {language === "zh" ? "选择年份" : "Select year"}
          </span>
          <select
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setView("month");
              setActiveKey(null);
            }}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="calendar-summary">
        <p className="calendar-total">
          {language === "zh"
            ? `${year} 年 · ${countLabel(activity.total)}`
            : `${countLabel(activity.total)} in ${year}`}
        </p>
        {activity.exactCount > 0 && (
          <div
            className="calendar-view-control"
            role="group"
            aria-label={language === "zh" ? "日历视图" : "Calendar view"}
          >
            {(["month", "day"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={view === value}
                onClick={() => {
                  setView(value);
                  setActiveKey(null);
                }}
              >
                {value === "month"
                  ? language === "zh"
                    ? "按月"
                    : "Monthly"
                  : language === "zh"
                    ? "按日"
                    : "Daily"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className="calendar-interaction"
        onPointerLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement))
            setActiveKey(null);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setActiveKey(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setActiveKey(null);
        }}
      >
        {view === "month" ? (
          <div
            className="calendar-month-heatmap"
            aria-label={
              language === "zh"
                ? `${year} 年按月动态`
                : `Monthly updates in ${year}`
            }
          >
            {activity.months.map((month) => {
              const count = month.entries.length;
              const contents = (
                <>
                  <span className="calendar-month-track" aria-hidden="true">
                    <strong className="calendar-month-count">
                      {count || ""}
                    </strong>
                    <span
                      className="calendar-month-beads"
                      style={{
                        "--bead-columns": Math.min(3, count || 1),
                      } as CSSProperties}
                    >
                      {month.entries.slice(0, 12).map((entry) => (
                        <i className="calendar-moment" key={entry.id} />
                      ))}
                      {count > 12 && (
                        <span className="calendar-moment-overflow">+{count - 12}</span>
                      )}
                    </span>
                    <span className="calendar-month-tick" />
                  </span>
                  <span className="calendar-month-name" aria-hidden="true">
                    {monthLabel(month.month)}
                  </span>
                </>
              );
              return count > 0 ? (
                <button
                  key={month.key}
                  type="button"
                  className={`calendar-month-cell has-news intensity-${Math.min(count, 3)}`}
                  data-active={activeKey === month.key || undefined}
                  aria-label={`${dateLabel(month.key, true)}: ${countLabel(count)}`}
                  aria-describedby={
                    activeKey === month.key ? tooltipId : undefined
                  }
                  onPointerEnter={() => setActiveKey(month.key)}
                  onFocus={() => setActiveKey(month.key)}
                  onClick={() => setActiveKey(month.key)}
                >
                  {contents}
                </button>
              ) : (
                <div
                  className="calendar-month-cell"
                  key={month.key}
                  aria-label={`${dateLabel(month.key, true)}: ${countLabel(0)}`}
                >
                  {contents}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="calendar-chart"
            style={{ "--calendar-columns": activity.columns } as CSSProperties}
          >
            <div className="calendar-month-labels" aria-hidden="true">
              {activity.months.map((month) => (
                <span
                  key={month.key}
                  style={{ gridColumn: `${month.column} / span 3` }}
                >
                  {monthLabel(month.month)}
                </span>
              ))}
            </div>
            <div className="calendar-week-labels" aria-hidden="true">
              <span>{language === "zh" ? "一" : "M"}</span>
              <span>{language === "zh" ? "三" : "W"}</span>
              <span>{language === "zh" ? "五" : "F"}</span>
            </div>
            <div
              className="calendar-grid"
              aria-label={
                language === "zh"
                  ? `${year} 年按日动态`
                  : `Daily updates in ${year}`
              }
            >
              {activity.days.map((day) =>
                day.entries.length > 0 ? (
                  <button
                    key={day.date}
                    type="button"
                    className={`calendar-day has-news intensity-${Math.min(day.entries.length, 3)}`}
                    aria-label={`${dateLabel(day.date)}: ${countLabel(day.entries.length)}`}
                    aria-describedby={
                      activeKey === day.date ? tooltipId : undefined
                    }
                    onPointerEnter={() => setActiveKey(day.date)}
                    onFocus={() => setActiveKey(day.date)}
                    onClick={() => setActiveKey(day.date)}
                  />
                ) : (
                  <span
                    key={day.date}
                    className={`calendar-day${day.inYear ? "" : " outside-year"}`}
                    aria-hidden="true"
                  />
                ),
              )}
            </div>
          </div>
        )}
        {view === "month" ? (
          <div className="calendar-ribbon-caption" aria-hidden="true">
            <span><i className="calendar-moment" />{language === "zh" ? "一颗光点，一则动态" : "One dot, one moment"}</span>
            <span>{language === "zh" ? "十二个月的足迹" : "Across twelve months"}</span>
          </div>
        ) : (
          <div className="calendar-legend" aria-hidden="true">
            <span>{language === "zh" ? "少" : "Less"}</span>
            <i className="calendar-day" />
            <i className="calendar-day intensity-1" />
            <i className="calendar-day intensity-2" />
            <i className="calendar-day intensity-3" />
            <span>{language === "zh" ? "多" : "More"}</span>
          </div>
        )}
        {activeKey && activeEntries.length > 0 && (
          <div className="calendar-tooltip glass" id={tooltipId} role="tooltip">
            <strong>{dateLabel(activeKey, Boolean(activeMonth))}</strong>
            <ul>
              {activeEntries.map((item) => (
                <li key={item.id}>
                  <span aria-hidden="true">{item.emoji}</span>{" "}
                  {item.content[language]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {monthlyCount > 0 && (
        <p className="calendar-precision-note">
          {view === "month"
            ? language === "zh"
              ? "选择月份，重温这一年的点滴。"
              : "Choose a month to revisit its moments."
            : language === "zh"
              ? `另有 ${monthlyCount} 条动态只记录了月份，可切换到按月视图查看。`
              : `${monthlyCount} ${monthlyCount === 1 ? "update has" : "updates have"} month-only dates. Switch to Monthly to see every update.`}
        </p>
      )}
      {activity.total === 0 && (
        <p className="calendar-empty">
          {language === "zh"
            ? "这一年的故事，等待慢慢写下。可选择其他年份浏览已有动态。"
            : "Room for the moments ahead. Choose another year to explore earlier updates."}
        </p>
      )}
    </section>
  );
}
