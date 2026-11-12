"use client";

/** Submits a POST to /demo/exit (a full navigation, so the cookie change takes effect). */
export function exitDemo() {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/demo/exit";
  document.body.appendChild(form);
  form.submit();
}
