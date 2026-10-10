import Foundation
import FoundationModels

/**
 * `wizards-apple`: Apple Intelligence on this Mac as a model for the runtime. One process per
 * call, as the runtime runs every installed AI client; nothing leaves the machine.
 *
 *   wizards-apple status              → {"available":true} | {"available":false,"reason":…}
 *   wizards-apple generate < call.json → {"text":…} | {"error":{"kind":…,"message":…}}
 *
 * A call: {"system":…,"prompt":…,"schema":{JSON schema}|null,"useCase":"general"|"tagging",
 * "maxTokens":…}. With a schema the answer is the model's guided generation, as JSON.
 */

struct Call: Decodable {
  var system: String?
  var prompt: String
  var schema: JSONValue?
  var useCase: String?
  var maxTokens: Int?
  var temperature: Double?
}

/// JSON as it comes: enough of it to read a JSON schema.
enum JSONValue: Decodable {
  case string(String), number(Double), bool(Bool), null
  case array([JSONValue]), object([String: JSONValue])

  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null; return }
    if let b = try? c.decode(Bool.self) { self = .bool(b); return }
    if let n = try? c.decode(Double.self) { self = .number(n); return }
    if let s = try? c.decode(String.self) { self = .string(s); return }
    if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
    self = .object(try c.decode([String: JSONValue].self))
  }

  subscript(key: String) -> JSONValue? {
    if case .object(let o) = self { return o[key] }
    return nil
  }
  var string: String? { if case .string(let s) = self { return s } else { return nil } }
  var strings: [String]? {
    if case .array(let a) = self { return a.compactMap(\.string) } else { return nil }
  }
  var object: [String: JSONValue]? { if case .object(let o) = self { return o } else { return nil } }
  var array: [JSONValue]? { if case .array(let a) = self { return a } else { return nil } }
  var isNull: Bool { if case .null = self { return true } else { return false } }
}

struct SchemaError: Error { let message: String }

/// A JSON schema (as the AI SDK writes one from zod) as the model's dynamic schema.
final class SchemaBuilder {
  private var names = 0
  private var definitions: [String: JSONValue] = [:]
  private(set) var dependencies: [DynamicGenerationSchema] = []
  private var built: Set<String> = []

  init(root: JSONValue) {
    definitions = root["$defs"]?.object ?? root["definitions"]?.object ?? [:]
  }

  private func fresh(_ hint: String?) -> String {
    names += 1
    let base = (hint ?? "Object").replacingOccurrences(of: "[^A-Za-z0-9_]", with: "_", options: .regularExpression)
    return "\(base.isEmpty ? "Object" : base)_\(names)"
  }

  func build(_ schema: JSONValue, name hint: String? = nil) throws -> DynamicGenerationSchema {
    if let ref = schema["$ref"]?.string {
      // "#/$defs/Name" | "#/definitions/Name"
      let key = String(ref.split(separator: "/").last ?? "")
      guard let target = definitions[key] else { throw SchemaError(message: "unknown $ref \(ref)") }
      if !built.contains(key) {
        built.insert(key)
        let dep = try build(target, name: key)
        dependencies.append(dep)
      }
      return DynamicGenerationSchema(referenceTo: key)
    }
    let description = schema["description"]?.string
    if let options = schema["enum"]?.strings, !options.isEmpty {
      return DynamicGenerationSchema(name: fresh(hint), description: description, anyOf: options)
    }
    if let const = schema["const"]?.string {
      return DynamicGenerationSchema(name: fresh(hint), description: description, anyOf: [const])
    }
    // anyOf [X, null] (nullable) → X; anyOf of objects → a union
    if let variants = (schema["anyOf"] ?? schema["oneOf"])?.array {
      let real = variants.filter { $0["type"]?.string != "null" }
      if real.count == 1 { return try build(real[0], name: hint) }
      if real.allSatisfy({ $0["type"]?.string == "string" && $0["enum"] != nil }) {
        let all = real.flatMap { $0["enum"]?.strings ?? [] }
        return DynamicGenerationSchema(name: fresh(hint), description: description, anyOf: all)
      }
      let schemas = try real.enumerated().map { try build($0.element, name: "\(hint ?? "Choice")\($0.offset)") }
      return DynamicGenerationSchema(name: fresh(hint), description: description, anyOf: schemas)
    }
    var type = schema["type"]?.string
    if type == nil, let types = schema["type"]?.strings {
      type = types.first { $0 != "null" }
    }
    switch type {
    case "string":
      return DynamicGenerationSchema(type: String.self)
    case "integer":
      return DynamicGenerationSchema(type: Int.self)
    case "number":
      return DynamicGenerationSchema(type: Double.self)
    case "boolean":
      return DynamicGenerationSchema(type: Bool.self)
    case "array":
      let items = try build(schema["items"] ?? .object(["type": .string("string")]), name: hint.map { "\($0)Item" })
      let min = schema["minItems"].flatMap { if case .number(let n) = $0 { return Int(n) } else { return nil } }
      let max = schema["maxItems"].flatMap { if case .number(let n) = $0 { return Int(n) } else { return nil } }
      return DynamicGenerationSchema(arrayOf: items, minimumElements: min, maximumElements: max)
    case "object", nil:
      let properties = schema["properties"]?.object ?? [:]
      let required = Set(schema["required"]?.strings ?? [])
      // Keep the schema's own order where the JSON kept it; a dictionary loses it, so sort by name.
      let props = try properties.keys.sorted().map { key -> DynamicGenerationSchema.Property in
        let sub = properties[key]!
        return DynamicGenerationSchema.Property(
          name: key,
          description: sub["description"]?.string,
          schema: try build(sub, name: key),
          isOptional: !required.contains(key) || (sub["anyOf"]?.array?.contains { $0["type"]?.string == "null" } ?? false)
        )
      }
      return DynamicGenerationSchema(name: fresh(hint), description: description, properties: props)
    default:
      throw SchemaError(message: "unsupported type \(type ?? "?")")
    }
  }
}

func emit(_ object: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func fail(_ kind: String, _ message: String) -> Never {
  emit(["error": ["kind": kind, "message": message]])
  exit(1)
}

func reasonOf(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
  switch reason {
  case .deviceNotEligible: return "deviceNotEligible"
  case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
  case .modelNotReady: return "modelNotReady"
  @unknown default: return "unavailable"
  }
}

func status() {
  let v = ProcessInfo.processInfo.operatingSystemVersion
  let os = "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
  switch SystemLanguageModel.default.availability {
  case .available:
    emit(["available": true, "os": os])
  case .unavailable(let reason):
    emit(["available": false, "reason": reasonOf(reason), "os": os])
  }
}

func generate() async {
  let input = FileHandle.standardInput.readDataToEndOfFile()
  let call: Call
  do {
    call = try JSONDecoder().decode(Call.self, from: input)
  } catch {
    fail("badCall", "\(error)")
  }
  let model = call.useCase == "tagging"
    ? SystemLanguageModel(useCase: .contentTagging)
    : SystemLanguageModel.default
  if case .unavailable(let reason) = model.availability {
    fail("unavailable", reasonOf(reason))
  }
  let session = call.system.map { LanguageModelSession(model: model, instructions: $0) }
    ?? LanguageModelSession(model: model)
  var options = GenerationOptions()
  if let t = call.temperature { options.temperature = t }
  if let m = call.maxTokens { options.maximumResponseTokens = m }
  do {
    if let schema = call.schema, !schema.isNull {
      let builder = SchemaBuilder(root: schema)
      let root = try builder.build(schema, name: "Answer")
      let generation = try GenerationSchema(root: root, dependencies: builder.dependencies)
      let response = try await session.respond(to: call.prompt, schema: generation, options: options)
      emit(["text": response.content.jsonString])
    } else {
      let response = try await session.respond(to: call.prompt, options: options)
      emit(["text": response.content])
    }
  } catch let error as SchemaError {
    fail("schema", error.message)
  } catch let error as LanguageModelSession.GenerationError {
    // The description names the case; the kind is what the runtime acts on.
    let detail = "\(error.localizedDescription) [\(error)]"
    switch error {
    case .exceededContextWindowSize: fail("contextWindow", detail)
    case .guardrailViolation: fail("guardrail", detail)
    case .rateLimited: fail("rateLimited", detail)
    case .unsupportedLanguageOrLocale: fail("language", detail)
    case .assetsUnavailable: fail("unavailable", detail)
    case .refusal: fail("refusal", detail)
    default: fail("generation", detail)
    }
  } catch {
    fail("generation", "\(error)")
  }
}

@main
struct Main {
  static func main() async {
    let command = CommandLine.arguments.dropFirst().first ?? "status"
    switch command {
    case "status": status()
    case "generate": await generate()
    default: fail("badCommand", "usage: wizards-apple status | generate < call.json")
    }
  }
}
