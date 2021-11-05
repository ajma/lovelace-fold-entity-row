import { LitElement, html, css, property } from "lit-element";
import { hass } from "card-tools/src/hass";
import pjson from "../package.json";
import { selectTree } from "card-tools/src/helpers";

interface LovelaceElement extends HTMLElement {
  hass?: any;
}

interface FoldEntityRowConfig {
  type: string;
  open: boolean;
  entity?: any;
  head?: any;
  items?: any[];
  entities?: any[];
  group_config?: any;
  padding?: number;
  clickable?: boolean;
  mute?: boolean;
  state_color?: boolean;
}

const DEFAULT_CONFIG = {
  open: false,
  padding: 24,
  group_config: {},
  tap_unfold: undefined,
};

function ensureObject(config: any) {
  if (config === undefined) return undefined;
  return typeof config === "string" ? { entity: config } : config;
}

export async function findParentCard(
  node: any,
  step = 0
): Promise<any | false> {
  if (step == 100) return false;
  if (!node) return false;

  if (node.localName === "hui-entities-card") return node;
  if (node.localName === "hui-picture-elements-card") return node;

  if (node.updateComplete) await node.updateComplete;
  if (node.parentElement) return findParentCard(node.parentElement);
  else if (node.parentNode) return findParentCard(node.parentNode);
  if ((node as any).host) return findParentCard(node.host);
  return false;
}

class FoldEntityRow extends LitElement {
  @property() open: boolean = false;
  @property() head?: LovelaceElement;
  @property() rows?: LovelaceElement[];
  @property() height = "0px";
  _config: FoldEntityRowConfig;
  _hass: any;

  setConfig(config: FoldEntityRowConfig) {
    this._config = config = Object.assign({}, DEFAULT_CONFIG, config);
    this.open = this.open || this._config.open;

    let head = ensureObject(config.entity || config.head);
    if (!head) {
      throw new Error("No fold head specified");
    }
    if (this._config.clickable === undefined) {
      if (head.entity === undefined && head.tap_action === undefined)
        this._config.clickable = true;
    }

    // Items are taken from the first available of the following
    // - config entities: (this allows auto-population of the list)
    // - config items: (for backwards compatibility - not recommended)
    // - The group specified as head
    let items = config.entities || config.items;
    if (head.entity && items === undefined) {
      items = hass().states[head.entity]?.attributes?.entity_id;
    }
    if (items === undefined) {
      throw new Error("No entities specified.");
    }
    if (!items || !Array.isArray(items)) {
      throw new Error("Entities must be a list.");
    }

    (async () => {
      this.head = await this._createRow(head, true);
      this.rows = await Promise.all(
        items.map(async (i) => this._createRow(ensureObject(i)))
      );
    })();
  }

  async _createRow(config: any, head = false) {
    const helpers = await (window as any).loadCardHelpers();
    const parentCard = await findParentCard(this);
    const state_color =
      this._config.state_color ?? parentCard?._config!.state_color;
    config = {
      state_color,
      ...config,
    };
    if (!head) {
      config = {
        ...this._config.group_config,
        ...config,
      };
    }

    const el = helpers.createRowElement(config);
    this.applyStyle(el, config, head);
    if (this._hass) {
      el.hass = this._hass;
    }

    return el;
  }

  async applyStyle(root: HTMLElement, config: any, head = false) {
    if (head) {
      // Special styling to stretch
      if (root.localName === "hui-section-row") {
        root.style.minHeight = "53px";
        const el = await selectTree(root, "$.divider");
        if (el) el.style.marginRight = "-56px";
      }
    }
    await customElements.whenDefined("card-mod");
    (customElements.get("card-mod") as any).applyToElement(
      root,
      "row",
      config.card_mod ? config.card_mod.style : config.style,
      { config }
    );
  }

  toggle(ev: Event) {
    if (ev) ev.stopPropagation();
    this.open = !this.open;
  }

  set hass(hass: any) {
    this._hass = hass;
    this.rows?.forEach((e) => (e.hass = hass));
    if (this.head) this.head.hass = hass;
  }

  update(changedProperties) {
    super.update(changedProperties);
    if (changedProperties.has("open")) {
      const el = this.shadowRoot.querySelector("#items") as HTMLElement;
      if (this.open) this.height = `${el.scrollHeight}px`;
      else this.height = "0px";
    }
  }

  firstUpdated() {
    if (this._config.open) {
      this.height = "unset";
      window.setTimeout(() => {
        const el = this.shadowRoot.querySelector("#items") as HTMLElement;
        if (this.open) this.height = `${el.scrollHeight}px`;
      }, 100);
    }
    if (this._config.clickable) {
      const head = this.shadowRoot.querySelector("#head");
      this.shadowRoot
        .querySelector("#head")
        .addEventListener("click", (ev: CustomEvent) => this._handleClick(ev), {
          capture: true,
        });
    }
    findParentCard(this).then((result) => {
      if (!result && this._config.mute !== true) {
        console.info(
          "%cYou are doing it wrong!",
          "color: red; font-weight: bold",
          ""
        );
        console.info(
          "Fold-entity-row should only EVER be used INSIDE an ENTITIES CARD."
        );
        console.info(
          "See https://github.com/thomasloven/lovelace-fold-entity-row/issues/146"
        );
        // Silence this warning by placing the fold-entity-row inside an entities card.
        // or by setting mute: true
      }
    });
  }

  _customEvent(ev: CustomEvent) {
    const detail: any = ev.detail;
    if (detail.fold_row) {
      this.toggle(ev);
    }
  }

  _handleClick(ev: CustomEvent) {
    if (this._config.clickable) this.toggle(ev);
  }

  render() {
    return html`
      <div
        id="head"
        @ll-custom=${this._customEvent}
        ?open=${this.open}
        role="${this._config.clickable ? "button" : ""}"
      >
        ${this.head}
        <ha-icon
          @click=${this.toggle}
          icon=${this.open ? "mdi:chevron-up" : "mdi:chevron-down"}
          role="button"
        ></ha-icon>
      </div>

      <div
        id="items"
        ?open=${this.open}
        aria-hidden="${String(!this.open)}"
        style=${`padding-left: ${this._config.padding}px; height: ${this.height};`}
      >
        ${this.rows}
      </div>
    `;
  }

  static get styles() {
    return css`
      #head {
        display: flex;
        align-items: center;
        --toggle-icon-width: 24px;
      }
      #head :not(ha-icon) {
        flex-grow: 1;
        max-width: calc(100% - var(--toggle-icon-width));
      }
      #head ha-icon {
        width: var(--toggle-icon-width);
        cursor: pointer;
      }

      #items {
        padding: 0;
        margin: 0;
        overflow: hidden;
        transition: height 0.3s ease-in-out;
      }
    `;
  }
}

if (!customElements.get("fold-entity-row")) {
  customElements.define("fold-entity-row", FoldEntityRow);
  console.info(
    `%cFOLD-ENTITY-ROW ${pjson.version} IS INSTALLED`,
    "color: green; font-weight: bold",
    ""
  );
}
