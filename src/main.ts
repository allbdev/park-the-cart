import "@fontsource/anton/latin-400.css";
import "@fontsource/anton/latin-ext-400.css";
import "@fontsource/barlow-semi-condensed/latin-400.css";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "@fontsource/barlow-semi-condensed/latin-ext-400.css";
import "@fontsource/barlow-semi-condensed/latin-ext-600.css";
import "@fontsource/cutive-mono/latin-400.css";
import "@fontsource/cutive-mono/latin-ext-400.css";
import "./styles.css";
import { t } from "./content/i18n";

const root = document.getElementById("app")!;
const h1 = document.createElement("h1");
h1.textContent = t("en", "meta.title");
root.append(h1);
