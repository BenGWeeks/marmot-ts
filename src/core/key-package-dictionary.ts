/** @module @category Core - Key Package */
import {
  type AppDataDictionary,
  type CustomExtension,
  type KeyPackage,
  appDataDictionaryExtensionType,
  getAppDataDictionary,
  makeAppDataDictionaryExtension,
} from "ts-mls";
import { LAST_RESORT_EXTENSION_TYPE } from "./protocol.js";

/** Read a unique, exactly encoded dictionary; validate the reusable marker. */
export function readKeyPackageDictionary(
  extensions: CustomExtension[],
): AppDataDictionary | undefined {
  const dictionaries = extensions.filter(
    (extension) => extension.extensionType === appDataDictionaryExtensionType,
  );
  if (dictionaries.length > 1)
    throw new Error("Duplicate KeyPackage app_data_dictionary extensions");
  const dictionary = getAppDataDictionary(extensions);
  if (dictionary) {
    // The MLS convenience decoder accepts trailing bytes. Re-encode to require
    // an exact canonical dictionary, including sorted, unique component ids.
    const canonical = makeAppDataDictionaryExtension(dictionary).extensionData;
    const supplied = dictionaries[0].extensionData;
    if (
      canonical.length !== supplied.length ||
      !canonical.every((byte, index) => byte === supplied[index])
    )
      throw new Error(
        "Invalid canonical KeyPackage app_data_dictionary encoding",
      );
  }
  const marker = dictionary?.find((entry) => entry.componentId === 0x0004);
  if (marker && marker.data.length !== 0)
    throw new Error("Invalid last_resort_key_package component data");
  return dictionary;
}

/** Classify reuse from signed KeyPackage data, rejecting invalid placement. */
export function isReusableKeyPackage(keyPackage: KeyPackage): boolean {
  const dictionary = readKeyPackageDictionary(keyPackage.extensions);
  const marker = dictionary?.find((entry) => entry.componentId === 0x0004);
  if (
    keyPackage.extensions.some(
      (extension) => extension.extensionType === LAST_RESORT_EXTENSION_TYPE,
    ) &&
    !marker
  )
    throw new Error(
      "Legacy-only last_resort extension is unsupported; republish a canonical KeyPackage",
    );
  const leafDictionary = readKeyPackageDictionary(
    keyPackage.leafNode.extensions as CustomExtension[],
  );
  if (
    leafDictionary?.some((entry) => entry.componentId === 0x0004) ||
    keyPackage.leafNode.extensions.some(
      (extension) => extension.extensionType === LAST_RESORT_EXTENSION_TYPE,
    )
  )
    throw new Error(
      "last_resort_key_package belongs in the KeyPackage dictionary, not the LeafNode",
    );
  return marker !== undefined;
}
