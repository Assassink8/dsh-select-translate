/**
 * dsh-select-translate — 浏览器半边（DSH Web 设置页）。
 *
 * 只在设置页渲染一行「截图翻译热键」：前缀固定 Ctrl+Alt，输入框里填末键。
 * 值来自 Host 的 cordis 配置（index.js 的 Config），写入走 settings.describe → configForms，
 * 落在 profile 补丁里，不碰划词自己的 JSON 文件。
 *
 * 这个文件由 DSH 的 client-modules 加载（window.__ModuleLoader__），格式与内置插件一致：
 * 导出 apply(ctx) / inject，由 Host 在浏览器侧调用。
 */
window.__ModuleLoader__.load({
  id: "dsh-select-translate",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    var React = require("react")

    /** 与 index.js Config 的 pattern、settings.mjs 的 HOTKEY_KEYS 保持一致。 */
    var KEY_PATTERN = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/
    var NS = "dsh-select-translate"

    var zh = {
      title: "截图翻译热键",
      prefix: "Ctrl + Alt +",
      placeholder: "S",
      hint: "填末键：A–Z、0–9 或 F1–F12（默认 S）。回车或点走即保存，立即生效。",
      saved: "已保存",
      failed: "保存失败，请重试",
      invalid: "只支持 A–Z、0–9 或 F1–F12",
    }
    var en = {
      title: "Screenshot hotkey",
      prefix: "Ctrl + Alt +",
      placeholder: "S",
      hint: "Pick the last key: A–Z, 0–9 or F1–F12 (default S). Enter or blur to save; applied immediately.",
      saved: "Saved",
      failed: "Could not save; try again",
      invalid: "Only A–Z, 0–9 or F1–F12 are allowed",
    }

    var inject = ["slots", "locale", "configForms"]

    function HotkeyRow(props) {
      var t = props.t
      var form = props.form
      var snapshot = React.useSyncExternalStore(
        function (onChange) { return form.subscribe(onChange) },
        function () { return form.getSnapshot() },
      )
      var current = (snapshot && snapshot.value && snapshot.value.hotkey) || "S"
      var textState = React.useState(current)
      var text = textState[0]
      var setText = textState[1]
      var noticeState = React.useState("")
      var notice = noticeState[0]
      var setNotice = noticeState[1]

      // 设置页外部改了值（或多标签页同步）时，把输入框拉回最新值。
      React.useEffect(function () {
        setText(current)
      }, [current])

      function commit(raw) {
        var key = String(raw || "").trim().toUpperCase()
        if (!KEY_PATTERN.test(key)) {
          setNotice("invalid")
          return
        }
        setText(key)
        setNotice("")
        form.set("hotkey", key).then(
          function (ok) { setNotice(ok ? "saved" : "failed") },
          function () { setNotice("failed") },
        )
      }

      var label = t("title")
      return React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "8px", padding: "6px 0 14px" } },
        React.createElement("div", { style: { fontSize: "14px", fontWeight: 600 } }, label),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement(
            "span",
            { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" } },
            t("prefix"),
          ),
          React.createElement("input", {
            type: "text",
            value: text,
            maxLength: 4,
            placeholder: t("placeholder"),
            spellCheck: false,
            autoComplete: "off",
            "aria-label": label,
            onChange: function (event) { setText(event.target.value) },
            onBlur: function (event) { commit(event.target.value) },
            onKeyDown: function (event) {
              if (event.key === "Enter") {
                event.preventDefault()
                commit(event.target.value)
              }
            },
            style: {
              width: "72px",
              padding: "6px 8px",
              textAlign: "center",
              textTransform: "uppercase",
              borderRadius: "6px",
              border: "1px solid var(--dsw-alias-border-l2)",
              background: "var(--dsw-alias-bg-l1, transparent)",
              color: "var(--dsw-alias-label-primary)",
              fontSize: "13px",
              fontFamily: "inherit",
              boxSizing: "border-box",
            },
          }),
        ),
        React.createElement(
          "div",
          { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" } },
          t("hint"),
        ),
        notice
          ? React.createElement(
              "div",
              {
                style: {
                  fontSize: "12px",
                  color: notice === "saved"
                    ? "var(--dsw-alias-label-tertiary)"
                    : "var(--dsw-alias-state-error-primary, #d33)",
                },
              },
              t(notice),
            )
          : null,
      )
    }

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en })
      })
      var t = ctx.locale.bind(NS)
      var form = ctx.configForms.get(NS)
      ctx.slots.inject("plugins.bundle.config", function () {
        return ctx.slots.register(
          { name: "plugins.bundle.config", key: NS, locale: NS },
          function () { return React.createElement(HotkeyRow, { t: t, form: form }) },
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
