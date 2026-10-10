import ExpoModulesCore

/**
 * Apple's models on this phone, for the runner bridge (src/bridge/handle.ts): whether they are
 * there, one text answer (guided by a JSON schema where the call brings one), and a recording
 * written down. The work is Shared.swift — the file the runtime's Mac helper is built from.
 * Nothing before iOS 26; the app offers the abilities only where `status` says so.
 */
public class AppleIntelligenceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleIntelligence")

    AsyncFunction("status") { () -> [String: Any] in
      if #available(iOS 26.0, *) {
        let a = appleAvailability()
        return ["supported": true, "available": a.available, "reason": a.reason ?? NSNull()]
      }
      return ["supported": false, "available": false, "reason": "os"]
    }

    AsyncFunction("generate") { (call: [String: Any]) async -> [String: Any] in
      guard #available(iOS 26.0, *) else { return failure("unavailable", "os") }
      do {
        let data = try JSONSerialization.data(withJSONObject: call)
        let decoded = try JSONDecoder().decode(Call.self, from: data)
        return ["text": try await appleGenerate(decoded)]
      } catch let error as AppleFailure {
        return failure(error.kind, error.message)
      } catch {
        return failure("generation", "\(error)")
      }
    }

    AsyncFunction("transcribe") { (path: String, locale: String) async -> [String: Any] in
      guard #available(iOS 26.0, *) else { return failure("unavailable", "os") }
      do {
        return ["text": try await appleTranscribe(path: path, locale: locale)]
      } catch let error as AppleFailure {
        return failure(error.kind, error.message)
      } catch {
        return failure("transcription", "\(error)")
      }
    }
  }
}

private func failure(_ kind: String, _ message: String) -> [String: Any] {
  ["error": ["kind": kind, "message": message]]
}
