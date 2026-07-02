const parseScheduleToNumber = (sched) => {
  if (!sched || sched === "TBD") return 9999999999;
  const parts = sched.split(" ");
  if (parts.length < 2) return 9999999999;
  const [datePart, timePart] = parts;
  const [day, month] = datePart.split("/");
  const [hour, minute] = timePart.split(":");
  return (
    parseInt(month || "0") * 1000000 +
    parseInt(day || "0") * 10000 +
    parseInt(hour || "0") * 100 +
    parseInt(minute || "0")
  );
};
console.log(parseScheduleToNumber("28/06 21:00"));
