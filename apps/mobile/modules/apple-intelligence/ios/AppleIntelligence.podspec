Pod::Spec.new do |s|
  s.name           = 'AppleIntelligence'
  s.version        = '1.0.0'
  s.summary        = "Apple's models on the phone for the engenty wizards app"
  s.description    = 'Apple Intelligence (Foundation Models) and SpeechAnalyzer behind the runner bridge; iOS 26 and later, nothing on older systems.'
  s.author         = 'engenty'
  s.homepage       = 'https://engenty.ai'
  s.license        = { :type => 'FSL-1.1-MIT' }
  s.platforms      = { :ios => '16.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  # Only iOS 26 has them: linked weak, so the app starts on older systems and the code checks first.
  s.weak_frameworks = 'FoundationModels', 'Speech'
  s.frameworks = 'AVFoundation'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
  s.source_files = '**/*.{h,m,mm,swift}'
end
