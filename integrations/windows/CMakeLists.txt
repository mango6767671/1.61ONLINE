cmake_minimum_required(VERSION 3.21)

project(one61_community_services LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "The community-services WinHTTP adapter is Windows-only.")
endif()

add_library(one61_community_services STATIC
  community_services_client.cpp
)

target_include_directories(one61_community_services
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
)

target_compile_features(one61_community_services PUBLIC cxx_std_17)
target_link_libraries(one61_community_services PUBLIC winhttp)

if(MSVC)
  target_compile_options(one61_community_services PRIVATE /W4 /permissive-)
endif()
