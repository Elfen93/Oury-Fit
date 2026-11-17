// Punto único de importación de Preact + htm (incluidos en /vendor, sin CDN).
import { h, render, createContext } from "../vendor/preact.js";
import { useState, useEffect, useRef, useMemo, useCallback, useContext } from "../vendor/hooks.js";
import htm from "../vendor/htm.js";

export const html = htm.bind(h);
export { h, render, createContext, useState, useEffect, useRef, useMemo, useCallback, useContext };
