/**
 * Summit Invoice — static prototype navigation & interactions
 * Hash routing · show/hide views · create-job wizard · no backend
 */

(function () {
  "use strict";

  const VIEWS_WITH_NAV = new Set(["dashboard", "jobs", "clients", "settings", "job", "client", "invoice"]);
  const WIZARD_STEPS = ["client", "details", "estimate", "milestones", "review"];
  const WIZARD_LABELS = {
    client: "Client",
    details: "Details",
    estimate: "Estimate",
    milestones: "Billing",
    review: "Review",
  };

  const VANITY_TEMPLATE = [
    { type: "mat", name: "Bath vanity — soft-close oak", cost: 980, markup: 35, qty: 1 },
    { type: "mat", name: "Quartz top — 37\" vanity", cost: 420, markup: 40, qty: 1 },
    { type: "lab", name: "Demo existing vanity & haul", cost: 380, markup: 0, qty: 1 },
    { type: "lab", name: "Install vanity, plumb & set top", cost: 720, markup: 0, qty: 1 },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Toast ---------- */
  let toastTimer;
  function showToast(msg) {
    const el = $("#toast");
    if (!el || !msg) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function lineSell(item) {
    const cost = Number(item.cost) || 0;
    const qty = Number(item.qty) || 1;
    if (item.type === "mat") {
      const mk = Number(item.markup) || 0;
      return cost * qty * (1 + mk / 100);
    }
    return cost * qty;
  }

  /* ---------- Routing ---------- */
  function currentRoute() {
    const hash = (location.hash || "#login").replace(/^#/, "");
    const [path, query] = hash.split("?");
    const parts = (path || "login").split("/").filter(Boolean);
    const view = parts[0] || "login";
    const step = parts[1] || null;
    return { view, step, query, path };
  }

  function showView(name) {
    $$(".view").forEach((v) => {
      const match = v.dataset.view === name;
      v.classList.toggle("active", match);
    });

    const nav = $("#bottomNav");
    const showNav = VIEWS_WITH_NAV.has(name) && name !== "login" && name !== "new";
    if (nav) {
      nav.hidden = !showNav;
      nav.classList.toggle("is-shown", showNav);
      nav.setAttribute("aria-hidden", showNav ? "false" : "true");
      nav.style.display = ""; // let CSS .is-shown own visibility
      $$("[data-nav]", nav).forEach((a) => {
        const isActive =
          a.dataset.nav === name ||
          (name === "job" && a.dataset.nav === "jobs") ||
          (name === "client" && a.dataset.nav === "clients") ||
          (name === "invoice" && a.dataset.nav === "jobs") ||
          (name === "new" && a.dataset.nav === "new");
        a.classList.toggle("active", isActive);
      });
    }

    syncEstimateCta();

    const active = $(`.view[data-view="${name}"]`);
    if (active) active.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function route() {
    const { view, step } = currentRoute();

    if (view === "new") {
      if (!$(`.view[data-view="new"]`)) {
        showView("login");
        return;
      }
      let s = WIZARD_STEPS.includes(step) ? step : "client";
      if (!WIZARD_STEPS.includes(step || "")) {
        if (location.hash !== "#new/client") {
          history.replaceState(null, "", "#new/client");
        }
        s = "client";
      }
      showView("new");
      wizard.showStep(s);
      return;
    }

    const known = $(`.view[data-view="${view}"]`);
    showView(known ? view : "login");
  }

  /* ---------- Job tabs ---------- */
  function activateTab(tabName) {
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === tabName;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === `tab-${tabName}`);
    });
    syncEstimateCta();
  }

  function syncEstimateCta() {
    const cta = $("#estimateCta");
    if (!cta) return;
    const onJob = currentRoute().view === "job";
    const estimateTab = $("#tab-estimate");
    const showingEstimate = estimateTab && estimateTab.classList.contains("active");
    cta.hidden = !(onJob && showingEstimate);
  }

  /* ---------- PWA banner ---------- */
  function initPwaBanner() {
    const banner = $("#pwaBanner");
    if (!banner) return;
    if (sessionStorage.getItem("pwaDismissed") === "1") {
      banner.classList.add("hidden");
      return;
    }
    $("#pwaDismiss")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      sessionStorage.setItem("pwaDismissed", "1");
    });
    $("#pwaInstall")?.addEventListener("click", () => {
      showToast("Install prompt would appear here (PWA)");
      banner.classList.add("hidden");
      sessionStorage.setItem("pwaDismissed", "1");
    });
  }

  /* ---------- Jobs list: search + status + timeframe ---------- */
  function initJobsList() {
    const search = $("#jobsSearch");
    const timeframe = $("#jobsTimeframe");
    const empty = $("#jobsEmpty");
    const table = $("#jobsTable");
    const countLabel = $("#jobsCountLabel");
    if (!table) return;

    // Prototype "today" aligned with demo data (Sep 24, 2026)
    const TODAY = new Date(2026, 8, 24); // month 0-indexed

    function startOfDay(d) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function inTimeframe(iso, frame) {
      if (frame === "all") return true;
      if (!iso) return true;
      const updated = startOfDay(new Date(iso + "T12:00:00"));
      const today = startOfDay(TODAY);
      if (frame === "week") {
        const from = new Date(today);
        from.setDate(from.getDate() - 6);
        return updated >= from && updated <= today;
      }
      if (frame === "month") {
        return (
          updated.getFullYear() === today.getFullYear() &&
          updated.getMonth() === today.getMonth()
        );
      }
      if (frame === "90") {
        const from = new Date(today);
        from.setDate(from.getDate() - 89);
        return updated >= from && updated <= today;
      }
      return true;
    }

    function statusMatch(rowStatus, filter) {
      if (filter === "all") return true;
      if (filter === "in-progress") {
        return rowStatus === "in-progress"; // includes deposit/punch via data-status
      }
      return rowStatus === filter;
    }

    function apply() {
      const q = (search?.value || "").trim().toLowerCase();
      const frame = timeframe?.value || "month";
      const statusChip = $(".chip[data-jobs-status].active");
      const status = statusChip?.dataset.jobsStatus || "all";
      let visible = 0;

      $$(".jobs-row").forEach((row) => {
        const hay = (row.dataset.search || "").toLowerCase();
        const okSearch = !q || hay.includes(q);
        const okStatus = statusMatch(row.dataset.status, status);
        const okTime = inTimeframe(row.dataset.updated, frame);
        const show = okSearch && okStatus && okTime;
        row.hidden = !show;
        if (show) visible++;
      });

      empty?.classList.toggle("hidden", visible > 0);
      table?.classList.toggle("hidden", visible === 0);
      if (countLabel) {
        countLabel.textContent = visible === 1 ? "1 job" : `${visible} jobs`;
      }
    }

    search?.addEventListener("input", apply);
    timeframe?.addEventListener("change", apply);

    $$(".chip[data-jobs-status]").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$(".chip[data-jobs-status]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        apply();
      });
    });

    $("#jobsClearFilters")?.addEventListener("click", () => {
      if (search) search.value = "";
      if (timeframe) timeframe.value = "all";
      $$(".chip[data-jobs-status]").forEach((c) =>
        c.classList.toggle("active", c.dataset.jobsStatus === "all")
      );
      apply();
    });

    apply();
  }

  /* ---------- Change order modal + empty state ---------- */
  function initChangeOrders() {
    const modal = $("#coModal");
    const list = $("#coList");
    const empty = $("#coEmpty");
    let showingEmpty = false;

    function openModal() {
      if (modal) modal.classList.add("open");
      $("#coTitle")?.focus();
    }
    function closeModal() {
      if (modal) modal.classList.remove("open");
    }

    $("#openCoModal")?.addEventListener("click", openModal);
    $("#openCoFromEmpty")?.addEventListener("click", openModal);
    $("#coCancel")?.addEventListener("click", closeModal);
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    $("#coForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = $("#coTitle")?.value?.trim() || "Change order";
      const amount = parseFloat($("#coAmount")?.value || "0");
      const notes = $("#coNotes")?.value?.trim() || "";
      const amtStr = amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

      if (list) list.classList.remove("hidden");
      if (empty) empty.classList.add("hidden");
      showingEmpty = false;

      const card = document.createElement("div");
      card.className = "card card-pad";
      card.style.marginTop = "12px";
      card.innerHTML = `
        <div class="flex-between">
          <div>
            <div class="fw-600">CO #2 — ${escapeHtml(title)}</div>
            <div class="text-xs text-muted mt-8">Draft · Will bill to upcoming milestones</div>
          </div>
          <div class="co-delta" style="font-size:1.0625rem">+${amtStr}</div>
        </div>
        <p class="text-sm text-muted mt-12">${escapeHtml(notes)}</p>
        <div class="flex-between mt-12 text-xs">
          <span class="badge badge-draft">Draft</span>
          <span class="text-muted">Job total would become $${(16840 + amount).toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
        </div>
      `;
      list?.appendChild(card);
      closeModal();
      showToast(`Change order saved · job total +${amtStr}`);
    });

    $("#toggleCoEmpty")?.addEventListener("click", () => {
      showingEmpty = !showingEmpty;
      if (showingEmpty) {
        list?.classList.add("hidden");
        empty?.classList.remove("hidden");
        $("#toggleCoEmpty").textContent = "Show sample change order";
      } else {
        list?.classList.remove("hidden");
        empty?.classList.add("hidden");
        $("#toggleCoEmpty").textContent = "Preview empty state";
      }
    });
  }

  /* ---------- Create-job wizard ---------- */
  const wizard = {
    state: null,
    msEditSource: "pct", // which field last drove recalc
    inited: false,

    defaultState() {
      return {
        clientMode: null, // 'existing' | 'new'
        client: null,
        newClient: { name: "", phone: "", email: "", address: "" },
        showNewForm: false,
        title: "",
        jobType: "both",
        sameAddress: true,
        siteAddress: "",
        installWindow: "",
        notes: "",
        estMode: "blank",
        lines: [],
        milestones: [
          { name: "Deposit", pct: 40, amount: 0, trigger: "On estimate accept" },
          { name: "Progress", pct: 40, amount: 0, trigger: "On materials ordered" },
          { name: "Final", pct: 20, amount: 0, trigger: "On install complete" },
        ],
      };
    },

    reset() {
      this.state = this.defaultState();
      this.msEditSource = "pct";
      // Clear DOM fields
      $("#wzClientSearch") && ($("#wzClientSearch").value = "");
      $$(".client-pick").forEach((b) => {
        b.classList.remove("selected", "hidden-by-search");
        b.style.display = "";
      });
      $("#wzClientEmpty")?.classList.add("hidden");
      $("#wzClientList")?.classList.remove("hidden");
      $("#wzNewClientForm")?.classList.add("hidden");
      if ($("#wzNewClientBtnLabel")) $("#wzNewClientBtnLabel").textContent = "+ New client";
      ["wzNewName", "wzNewPhone", "wzNewEmail", "wzNewAddress"].forEach((id) => {
        const el = $("#" + id);
        if (el) el.value = "";
      });
      if ($("#wzTitle")) $("#wzTitle").value = "";
      if ($("#wzSiteAddress")) {
        $("#wzSiteAddress").value = "";
        $("#wzSiteAddress").disabled = true;
      }
      if ($("#wzSameAddress")) $("#wzSameAddress").checked = true;
      if ($("#wzSiteHint")) $("#wzSiteHint").textContent = "Using client address";
      if ($("#wzInstallWindow")) $("#wzInstallWindow").value = "";
      if ($("#wzNotes")) $("#wzNotes").value = "";
      $$(".type-chip").forEach((c) => c.classList.toggle("active", c.dataset.jobType === "both"));
      $$(".est-mode-card").forEach((c) => c.classList.toggle("active", c.dataset.estMode === "blank"));
      $("#wzEstimateEditor")?.classList.add("hidden");
      $("#wzEstBlankNote")?.classList.remove("hidden");
      this.renderLines();
      this.syncMilestoneDomFromState();
      this.updateTotals();
    },

    estimateTotal() {
      if (this.state.estMode === "blank" || !this.state.lines.length) return 0;
      return this.state.lines.reduce((s, li) => s + lineSell(li), 0);
    },

    matSub() {
      return this.state.lines
        .filter((l) => l.type === "mat")
        .reduce((s, li) => s + lineSell(li), 0);
    },

    labSub() {
      return this.state.lines
        .filter((l) => l.type === "lab")
        .reduce((s, li) => s + lineSell(li), 0);
    },

    showStep(step) {
      if (!this.state) this.reset();
      if (!WIZARD_STEPS.includes(step)) step = "client";

      $$(".wizard-panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.wzPanel !== step);
      });

      const idx = WIZARD_STEPS.indexOf(step);
      const pct = ((idx + 1) / WIZARD_STEPS.length) * 100;
      const fill = $("#wizardFill");
      if (fill) fill.style.width = pct + "%";

      $$(".wz-step").forEach((el) => {
        const s = el.dataset.wz;
        const si = WIZARD_STEPS.indexOf(s);
        el.classList.toggle("current", s === step);
        el.classList.toggle("done", si < idx);
      });

      const label = $("#wizardStepLabel");
      if (label) {
        label.textContent = `Step ${idx + 1} of 5 · ${WIZARD_LABELS[step]}`;
      }

      const back = $("#wzBack");
      const cont = $("#wzContinue");
      if (back) {
        back.hidden = idx === 0;
        back.textContent = "Back";
      }
      if (cont) {
        if (step === "review") {
          cont.textContent = "Create job";
        } else if (step === "estimate") {
          cont.textContent = this.state.estMode === "blank" ? "Skip / Continue" : "Continue";
        } else {
          cont.textContent = "Continue";
        }
      }

      if (step === "milestones") {
        this.recalcMilestonesFromPct();
        this.syncMilestoneDomFromState();
      }
      if (step === "review") this.renderReview();
      if (step === "estimate") this.updateTotals();
      if (step === "details") this.syncSiteAddressUi();

      this.validate();
      const body = $(".wizard-body");
      if (body) body.scrollTop = 0;
      window.scrollTo(0, 0);
    },

    go(delta) {
      const { step } = currentRoute();
      const cur = WIZARD_STEPS.includes(step) ? step : "client";
      const idx = WIZARD_STEPS.indexOf(cur);
      const next = WIZARD_STEPS[idx + delta];
      if (!next) return;
      if (delta > 0 && !this.isStepValid(cur)) {
        showToast("Fill required fields to continue");
        return;
      }
      location.hash = "#new/" + next;
    },

    isStepValid(step) {
      const s = this.state;
      if (step === "client") {
        if (s.clientMode === "existing" && s.client) return true;
        if (s.clientMode === "new") {
          return !!(s.newClient.name.trim() && (s.newClient.phone.trim() || s.newClient.email.trim()));
        }
        return false;
      }
      if (step === "details") {
        return !!s.title.trim();
      }
      if (step === "estimate") return true; // optional
      if (step === "milestones") {
        const total = this.estimateTotal();
        const sum = s.milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);
        if (total === 0) return true; // blank estimate — milestones stay 0
        return Math.abs(sum - total) < 0.05;
      }
      if (step === "review") return this.isStepValid("client") && this.isStepValid("details");
      return true;
    },

    validate() {
      const { step } = currentRoute();
      const cur = WIZARD_STEPS.includes(step) ? step : "client";
      const cont = $("#wzContinue");
      if (cont) cont.disabled = !this.isStepValid(cur);
    },

    selectClient(btn) {
      this.state.showNewForm = false;
      $("#wzNewClientForm")?.classList.add("hidden");
      if ($("#wzNewClientBtnLabel")) $("#wzNewClientBtnLabel").textContent = "+ New client";

      $$(".client-pick").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      this.state.clientMode = "existing";
      this.state.client = {
        id: btn.dataset.clientId,
        name: btn.dataset.name,
        phone: btn.dataset.phone,
        email: btn.dataset.email,
        address: btn.dataset.address,
        initials: btn.dataset.initials,
      };
      // Prefill title suggestion if empty
      if (!$("#wzTitle")?.value) {
        const first = this.state.client.name.split(/[&,]/)[0].trim().split(/\s+/).pop();
        const suggestion = `${first} kitchen remodel`;
        // don't force — leave blank, but store address for site
      }
      this.syncSiteAddressUi();
      this.validate();
    },

    toggleNewClient() {
      const form = $("#wzNewClientForm");
      const showing = !form?.classList.contains("hidden");
      if (showing) {
        form.classList.add("hidden");
        this.state.showNewForm = false;
        if ($("#wzNewClientBtnLabel")) $("#wzNewClientBtnLabel").textContent = "+ New client";
        // If they had typed a name, keep mode if valid; else clear new mode
        if (!(this.state.clientMode === "new" && this.state.newClient.name.trim())) {
          this.state.clientMode = this.state.client ? "existing" : null;
        }
      } else {
        form?.classList.remove("hidden");
        this.state.showNewForm = true;
        if ($("#wzNewClientBtnLabel")) $("#wzNewClientBtnLabel").textContent = "Hide new client form";
        $$(".client-pick").forEach((b) => b.classList.remove("selected"));
        this.state.client = null;
        this.state.clientMode = "new";
        // Prefill demo Rivera if empty
        if (!$("#wzNewName")?.value) {
          $("#wzNewName").value = "Sofia Rivera";
          $("#wzNewPhone").value = "(571) 555-0162";
          $("#wzNewEmail").value = "sofia.rivera@email.demo";
          $("#wzNewAddress").value = "118 Cascade Ct, Vienna, VA 22180";
          this.readNewClientFields();
        }
        if (!$("#wzTitle")?.value) {
          // soft hint via placeholder only
        }
        $("#wzNewName")?.focus();
      }
      this.validate();
    },

    readNewClientFields() {
      this.state.newClient = {
        name: $("#wzNewName")?.value || "",
        phone: $("#wzNewPhone")?.value || "",
        email: $("#wzNewEmail")?.value || "",
        address: $("#wzNewAddress")?.value || "",
      };
      if (this.state.newClient.name.trim()) {
        this.state.clientMode = "new";
        this.state.client = null;
        $$(".client-pick").forEach((b) => b.classList.remove("selected"));
      }
      this.syncSiteAddressUi();
      this.validate();
    },

    syncSiteAddressUi() {
      const same = $("#wzSameAddress")?.checked !== false;
      this.state.sameAddress = same;
      const input = $("#wzSiteAddress");
      const hint = $("#wzSiteHint");
      if (!input) return;
      if (same) {
        input.disabled = true;
        const addr =
          this.state.clientMode === "existing" && this.state.client
            ? this.state.client.address
            : this.state.newClient.address || "";
        input.value = addr;
        this.state.siteAddress = addr;
        if (hint) hint.textContent = addr ? "Using client address" : "Will use client address when set";
      } else {
        input.disabled = false;
        if (hint) hint.textContent = "Enter the job site if different from homeowner address";
      }
    },

    setEstMode(mode) {
      this.state.estMode = mode;
      $$(".est-mode-card").forEach((c) => c.classList.toggle("active", c.dataset.estMode === mode));
      if (mode === "blank") {
        this.state.lines = [];
        $("#wzEstimateEditor")?.classList.add("hidden");
        $("#wzEstBlankNote")?.classList.remove("hidden");
      } else {
        if (!this.state.lines.length) {
          this.state.lines = VANITY_TEMPLATE.map((l) => ({ ...l }));
        }
        $("#wzEstimateEditor")?.classList.remove("hidden");
        $("#wzEstBlankNote")?.classList.add("hidden");
        this.renderLines();
      }
      this.updateTotals();
      this.recalcMilestonesFromPct();
      const cont = $("#wzContinue");
      if (cont && currentRoute().step === "estimate") {
        cont.textContent = mode === "blank" ? "Skip / Continue" : "Continue";
      }
      this.validate();
    },

    renderLines() {
      const wrap = $("#wzLineItems");
      if (!wrap) return;
      if (!this.state.lines.length) {
        wrap.innerHTML = `<p class="text-sm text-muted">No line items yet. Add one or pick the vanity template.</p>`;
        return;
      }
      wrap.innerHTML = this.state.lines
        .map((li, i) => {
          const sell = money(lineSell(li));
          return `
          <div class="wz-line" data-line-idx="${i}">
            <div class="wz-line-top">
              <input class="form-input wz-name" value="${escapeHtml(li.name)}" placeholder="Description" />
              <div class="wz-line-type">
                <button type="button" class="wz-type-btn mat ${li.type === "mat" ? "active" : ""}" data-set-type="mat">Mat</button>
                <button type="button" class="wz-type-btn lab ${li.type === "lab" ? "active" : ""}" data-set-type="lab">Lab</button>
              </div>
            </div>
            <div class="wz-line-grid">
              <div class="form-group">
                <label>${li.type === "mat" ? "Cost $" : "Amount $"}</label>
                <input class="form-input wz-cost" type="number" min="0" step="0.01" value="${li.cost}" />
              </div>
              <div class="form-group">
                <label>${li.type === "mat" ? "Markup %" : "Qty"}</label>
                <input class="form-input wz-markup" type="number" min="0" step="1" value="${li.type === "mat" ? li.markup : li.qty}" />
              </div>
              <div class="form-group">
                <label>${li.type === "mat" ? "Qty" : "—"}</label>
                <input class="form-input wz-qty" type="number" min="1" step="1" value="${li.qty}" ${li.type === "lab" ? "disabled" : ""} />
              </div>
              <div class="wz-line-price">${sell}</div>
            </div>
            <button type="button" class="wz-line-remove" data-remove-line>Remove</button>
          </div>`;
        })
        .join("");
    },

    readLineDom(idx) {
      const row = $(`.wz-line[data-line-idx="${idx}"]`);
      if (!row || !this.state.lines[idx]) return;
      const li = this.state.lines[idx];
      li.name = row.querySelector(".wz-name")?.value || "";
      li.cost = parseFloat(row.querySelector(".wz-cost")?.value || "0") || 0;
      if (li.type === "mat") {
        li.markup = parseFloat(row.querySelector(".wz-markup")?.value || "0") || 0;
        li.qty = parseFloat(row.querySelector(".wz-qty")?.value || "1") || 1;
      } else {
        li.qty = 1;
        // for labor, markup field holds qty-like unused; amount is cost
        li.markup = 0;
      }
    },

    updateTotals() {
      const mat = this.matSub();
      const lab = this.labSub();
      const tot = this.estimateTotal();
      if ($("#wzMatSub")) $("#wzMatSub").textContent = money(mat);
      if ($("#wzLabSub")) $("#wzLabSub").textContent = money(lab);
      if ($("#wzEstTotal")) $("#wzEstTotal").textContent = money(tot);
      // refresh per-line prices without full re-render if possible
      $$(".wz-line").forEach((row) => {
        const i = parseInt(row.dataset.lineIdx, 10);
        const price = row.querySelector(".wz-line-price");
        if (price && this.state.lines[i]) price.textContent = money(lineSell(this.state.lines[i]));
      });
    },

    recalcMilestonesFromPct() {
      const total = this.estimateTotal();
      let allocated = 0;
      this.state.milestones.forEach((m, i) => {
        if (i === this.state.milestones.length - 1) {
          m.amount = Math.round((total - allocated) * 100) / 100;
        } else {
          m.amount = Math.round(total * (m.pct / 100) * 100) / 100;
          allocated += m.amount;
        }
      });
      this.syncMilestoneMatchUi();
    },

    recalcMilestonesFromAmt() {
      const total = this.estimateTotal();
      this.state.milestones.forEach((m) => {
        m.pct = total > 0 ? Math.round((m.amount / total) * 1000) / 10 : 0;
      });
      this.syncMilestoneMatchUi();
    },

    syncMilestoneDomFromState() {
      $$(".ms-edit").forEach((row) => {
        const i = parseInt(row.dataset.msIdx, 10);
        const m = this.state.milestones[i];
        if (!m) return;
        const pct = row.querySelector(".ms-pct");
        const amt = row.querySelector(".ms-amt");
        const trig = row.querySelector(".ms-trigger");
        const badge = row.querySelector(".badge");
        if (pct) pct.value = m.pct;
        if (amt) amt.value = Number(m.amount).toFixed(2);
        if (trig) {
          // select matching option
          Array.from(trig.options).forEach((o) => {
            o.selected = o.value === m.trigger || o.textContent === m.trigger;
          });
        }
        if (badge) badge.textContent = `${m.pct}%`;
      });
      this.syncMilestoneMatchUi();
    },

    syncMilestoneMatchUi() {
      const total = this.estimateTotal();
      const sum = this.state.milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);
      if ($("#wzMsSum")) $("#wzMsSum").textContent = money(sum);
      if ($("#wzMsEstRef")) $("#wzMsEstRef").textContent = money(total);
      const ok = Math.abs(sum - total) < 0.05;
      $("#wzMsMatchOk")?.classList.toggle("hidden", !ok);
      $("#wzMsMatchBad")?.classList.toggle("hidden", ok);
      this.validate();
    },

    readMilestonesFromDom(source) {
      $$(".ms-edit").forEach((row) => {
        const i = parseInt(row.dataset.msIdx, 10);
        const m = this.state.milestones[i];
        if (!m) return;
        const pct = parseFloat(row.querySelector(".ms-pct")?.value || "0") || 0;
        const amt = parseFloat(row.querySelector(".ms-amt")?.value || "0") || 0;
        const trig = row.querySelector(".ms-trigger");
        m.trigger = trig?.selectedOptions?.[0]?.textContent || m.trigger;
        if (source === "pct") {
          m.pct = pct;
        } else {
          m.amount = amt;
        }
        const badge = row.querySelector(".badge");
        if (badge && source === "pct") badge.textContent = `${pct}%`;
      });
      if (source === "pct") {
        this.recalcMilestonesFromPct();
        // write amounts back
        $$(".ms-edit").forEach((row) => {
          const i = parseInt(row.dataset.msIdx, 10);
          const m = this.state.milestones[i];
          const amt = row.querySelector(".ms-amt");
          const badge = row.querySelector(".badge");
          if (amt) amt.value = Number(m.amount).toFixed(2);
          if (badge) badge.textContent = `${m.pct}%`;
        });
      } else {
        this.recalcMilestonesFromAmt();
        $$(".ms-edit").forEach((row) => {
          const i = parseInt(row.dataset.msIdx, 10);
          const m = this.state.milestones[i];
          const pct = row.querySelector(".ms-pct");
          const badge = row.querySelector(".badge");
          if (pct) pct.value = m.pct;
          if (badge) badge.textContent = `${m.pct}%`;
        });
      }
      this.syncMilestoneMatchUi();
    },

    getClientSummary() {
      if (this.state.clientMode === "existing" && this.state.client) {
        return {
          name: this.state.client.name,
          meta: `${this.state.client.phone} · ${this.state.client.email}`,
          address: this.state.client.address,
          initials: this.state.client.initials,
        };
      }
      const n = this.state.newClient;
      const parts = n.name.trim().split(/\s+/);
      const initials =
        (parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
      return {
        name: n.name.trim() || "New client",
        meta: [n.phone, n.email].filter(Boolean).join(" · ") || "New client",
        address: n.address,
        initials: initials.toUpperCase(),
      };
    },

    renderReview() {
      const c = this.getClientSummary();
      if ($("#rvAvatar")) $("#rvAvatar").textContent = c.initials;
      if ($("#rvClientName")) $("#rvClientName").textContent = c.name;
      if ($("#rvClientMeta")) $("#rvClientMeta").textContent = c.meta;

      if ($("#rvTitle")) $("#rvTitle").textContent = this.state.title || "—";
      const typeLabel =
        this.state.jobType === "cabinets"
          ? "Cabinets"
          : this.state.jobType === "countertops"
            ? "Countertops"
            : "Cabinets + countertops";
      if ($("#rvType")) $("#rvType").textContent = typeLabel;
      const site = this.state.sameAddress
        ? c.address || "Same as client"
        : this.state.siteAddress || "—";
      if ($("#rvSite")) $("#rvSite").textContent = site;
      if ($("#rvWindow")) {
        $("#rvWindow").textContent = this.state.installWindow
          ? `Install window: ${this.state.installWindow}`
          : "";
      }

      const tot = this.estimateTotal();
      if ($("#rvEstTotal")) $("#rvEstTotal").textContent = money(tot);
      if ($("#rvEstMeta")) {
        if (this.state.estMode === "blank" || !this.state.lines.length) {
          $("#rvEstMeta").textContent = "Blank draft — add lines later";
        } else {
          $("#rvEstMeta").textContent = `${this.state.lines.length} line items · ${money(this.matSub())} mat · ${money(this.labSub())} labor`;
        }
      }

      const msWrap = $("#rvMilestones");
      if (msWrap) {
        msWrap.innerHTML = this.state.milestones
          .map(
            (m) => `
          <div class="rv-ms-row">
            <div>
              <div class="fw-600">${escapeHtml(m.name)} · ${m.pct}%</div>
              <div class="text-xs text-muted">${escapeHtml(m.trigger)}</div>
            </div>
            <div class="rv-ms-amt">${money(m.amount)}</div>
          </div>`
          )
          .join("");
      }
    },

    createJob() {
      if (!this.isStepValid("review")) {
        showToast("Complete required fields first");
        return;
      }
      const title = this.state.title || "New job";
      showToast(`Job created — ${title}`);
      // Reset for next time, then go to sample job detail
      setTimeout(() => {
        this.reset();
        location.hash = "#job";
      }, 400);
    },

    init() {
      if (this.inited) return;
      this.inited = true;
      this.reset();

      // Client search
      $("#wzClientSearch")?.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        let visible = 0;
        $$(".client-pick").forEach((btn) => {
          const name = (btn.dataset.name || "").toLowerCase();
          const match = !q || name.includes(q);
          btn.classList.toggle("hidden-by-search", !match);
          btn.style.display = match ? "" : "none";
          // also hide adjacent dividers roughly by parent card — hide divider after hidden picks
          if (match) visible++;
        });
        // Hide dividers that follow hidden picks
        const list = $("#wzClientList");
        if (list) {
          Array.from(list.children).forEach((child) => {
            if (child.classList.contains("divider")) {
              const prev = child.previousElementSibling;
              child.style.display = prev && prev.style.display === "none" ? "none" : "";
            }
          });
        }
        $("#wzClientEmpty")?.classList.toggle("hidden", visible > 0 || !q);
        $("#wzClientList")?.classList.toggle("hidden", visible === 0 && !!q);
      });

      $$(".client-pick").forEach((btn) => {
        btn.addEventListener("click", () => this.selectClient(btn));
      });

      $("#wzToggleNewClient")?.addEventListener("click", () => this.toggleNewClient());

      ["wzNewName", "wzNewPhone", "wzNewEmail", "wzNewAddress"].forEach((id) => {
        $("#" + id)?.addEventListener("input", () => this.readNewClientFields());
      });

      // Details
      $("#wzTitle")?.addEventListener("input", (e) => {
        this.state.title = e.target.value;
        this.validate();
      });
      $$(".type-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          $$(".type-chip").forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");
          this.state.jobType = chip.dataset.jobType;
        });
      });
      $("#wzSameAddress")?.addEventListener("change", () => {
        this.syncSiteAddressUi();
      });
      $("#wzSiteAddress")?.addEventListener("input", (e) => {
        this.state.siteAddress = e.target.value;
      });
      $("#wzInstallWindow")?.addEventListener("input", (e) => {
        this.state.installWindow = e.target.value;
      });
      $("#wzNotes")?.addEventListener("input", (e) => {
        this.state.notes = e.target.value;
      });

      // Estimate modes
      $$(".est-mode-card").forEach((card) => {
        card.addEventListener("click", () => this.setEstMode(card.dataset.estMode));
      });

      $("#wzAddLine")?.addEventListener("click", () => {
        this.state.estMode = "template";
        $$(".est-mode-card").forEach((c) =>
          c.classList.toggle("active", c.dataset.estMode === "template")
        );
        $("#wzEstimateEditor")?.classList.remove("hidden");
        $("#wzEstBlankNote")?.classList.add("hidden");
        this.state.lines.push({
          type: "mat",
          name: "",
          cost: 0,
          markup: 35,
          qty: 1,
        });
        this.renderLines();
        this.updateTotals();
        this.recalcMilestonesFromPct();
      });

      $("#wzLineItems")?.addEventListener("click", (e) => {
        const typeBtn = e.target.closest("[data-set-type]");
        if (typeBtn) {
          const row = typeBtn.closest(".wz-line");
          const i = parseInt(row.dataset.lineIdx, 10);
          this.readLineDom(i);
          this.state.lines[i].type = typeBtn.dataset.setType;
          if (this.state.lines[i].type === "lab") {
            this.state.lines[i].markup = 0;
            this.state.lines[i].qty = 1;
          } else if (!this.state.lines[i].markup) {
            this.state.lines[i].markup = 35;
          }
          this.renderLines();
          this.updateTotals();
          this.recalcMilestonesFromPct();
          return;
        }
        if (e.target.closest("[data-remove-line]")) {
          const row = e.target.closest(".wz-line");
          const i = parseInt(row.dataset.lineIdx, 10);
          this.state.lines.splice(i, 1);
          this.renderLines();
          this.updateTotals();
          this.recalcMilestonesFromPct();
        }
      });

      $("#wzLineItems")?.addEventListener("input", (e) => {
        const row = e.target.closest(".wz-line");
        if (!row) return;
        const i = parseInt(row.dataset.lineIdx, 10);
        this.readLineDom(i);
        this.updateTotals();
        this.recalcMilestonesFromPct();
      });

      // Milestones
      $("#wzMilestoneList")?.addEventListener("input", (e) => {
        if (e.target.classList.contains("ms-pct")) {
          this.readMilestonesFromDom("pct");
        } else if (e.target.classList.contains("ms-amt")) {
          this.readMilestonesFromDom("amt");
        }
      });
      $("#wzMilestoneList")?.addEventListener("change", (e) => {
        if (e.target.classList.contains("ms-trigger")) {
          this.readMilestonesFromDom(this.msEditSource || "pct");
        }
      });

      // Nav buttons
      $("#wzBack")?.addEventListener("click", () => this.go(-1));
      $("#wzContinue")?.addEventListener("click", () => {
        const { step } = currentRoute();
        const cur = WIZARD_STEPS.includes(step) ? step : "client";
        // Persist details fields before leaving
        this.state.title = $("#wzTitle")?.value || this.state.title;
        this.state.siteAddress = $("#wzSiteAddress")?.value || this.state.siteAddress;
        this.state.installWindow = $("#wzInstallWindow")?.value || "";
        this.state.notes = $("#wzNotes")?.value || "";
        // Soft fill title from Rivera demo
        if (cur === "client" && this.state.clientMode === "new" && !this.state.title) {
          const n = this.state.newClient.name.toLowerCase();
          if (n.includes("rivera")) {
            this.state.title = "Rivera bathroom vanity";
            if ($("#wzTitle")) $("#wzTitle").value = this.state.title;
          }
        }
        if (cur === "review") {
          this.createJob();
        } else {
          this.go(1);
        }
      });

      // Reset when opening wizard fresh from FAB / quick action
      // (handled on route when landing on client with no prior — soft reset only if arriving from outside)
    },
  };

  /* ---------- Delegated clicks ---------- */
  function initDelegates() {
    document.addEventListener("click", (e) => {
      const toastBtn = e.target.closest("[data-toast]");
      if (toastBtn) {
        e.preventDefault();
        showToast(toastBtn.getAttribute("data-toast"));
        const href = toastBtn.getAttribute("href");
        if (href && href.startsWith("#")) {
          location.hash = href;
        }
      }

      const tab = e.target.closest(".tab[data-tab]");
      if (tab) {
        activateTab(tab.dataset.tab);
      }

      const backTab = e.target.closest("[data-back-tab]");
      if (backTab) {
        const tabName = backTab.getAttribute("data-back-tab");
        setTimeout(() => activateTab(tabName), 0);
      }

      // Entering create flow from FAB / quick action — reset draft
      // Do not reset when hopping between wizard steps (e.g. Review → Edit)
      const newLink = e.target.closest('a[href="#new"], a[href="#new/client"]');
      if (newLink) {
        const fromWizard = currentRoute().view === "new";
        if (!fromWizard) wizard.reset();
      }
    });

    $("#loginForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        sessionStorage.setItem("summitSignedIn", "1");
      } catch (_) {}
      location.hash = "#dashboard";
    });

    $("#signOutBtn")?.addEventListener("click", () => {
      try {
        sessionStorage.removeItem("summitSignedIn");
      } catch (_) {}
      location.hash = "#login";
      showToast("Signed out");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        $("#coModal")?.classList.remove("open");
      }
    });
  }

  /* ---------- Boot ---------- */
  function init() {
    initPwaBanner();
    initJobsList();
    initChangeOrders();
    initDelegates();
    wizard.init();
    window.addEventListener("hashchange", route);
    let signedIn = false;
    try {
      signedIn = sessionStorage.getItem("summitSignedIn") === "1";
    } catch (_) {}
    if (!location.hash || location.hash === "#login") {
      const target = signedIn ? "#dashboard" : "#login";
      if (location.hash !== target) location.hash = target;
      else route();
    } else {
      route();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
